import {
  canonicalSha256,
  canonicalStringify,
  createStableId,
  type Concept,
  type Formation,
  type PlayDocument,
  type Playbook,
} from "@chalk/domain";
import {
  MAX_PULL_PAGE,
  MAX_PUSH_BATCH,
  CURRENT_WIRE_SCHEMA_VERSION,
  SYNC_DEBOUNCE_MS,
  type ConflictResolution,
  type SyncChange,
  type SyncMutationEnvelope,
} from "@chalk/contracts";
import type {
  ChalkLocalRepository,
  LocalConflict,
  StoredPlay,
  SyncMutation,
} from "@chalk/local-db";

import { nextRetryAtMs } from "./backoff";
import { UnauthenticatedError } from "./engine";
import type {
  CloudReplica,
  IdentityPort,
  SyncHeadWatcher,
  SyncStatus,
} from "./ports";

const CURSOR_KEY = "sync.cursor.v1";
const DEVICE_ID_KEY = "sync.deviceId.v1";
const DEVICE_LABEL_KEY = "sync.deviceLabel.v1";
const COACH_ID_KEY = "sync.coachId.v1";

export interface SyncOrchestratorOptions {
  readonly repository: ChalkLocalRepository;
  readonly replica: CloudReplica;
  readonly identity: IdentityPort;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly online?: () => boolean;
  readonly debounceMs?: number;
  readonly createId?: (prefix: string) => string;
  readonly currentPlayId?: () => string | undefined;
  readonly headWatcher?: SyncHeadWatcher;
  readonly onOpenPlayChanged?: (play: PlayDocument) => void;
}

export interface SyncSnapshot {
  readonly status: SyncStatus;
  readonly pendingCount: number;
  readonly conflictCount: number;
  readonly lastError?: string;
  readonly headCursor?: string;
}

export interface ConflictInboxItem extends LocalConflict {
  readonly playName: string;
  readonly localDocument?: PlayDocument;
  readonly remoteDocument?: PlayDocument;
}

export interface SyncOrchestrator {
  getSnapshot(this: void): SyncSnapshot;
  subscribe(this: void, listener: () => void): () => void;
  start(this: void): () => void;
  notifyLocalEdit(this: void): void;
  syncNow(this: void): Promise<SyncSnapshot>;
  listConflicts(this: void): Promise<readonly ConflictInboxItem[]>;
  resolveConflict(
    this: void,
    conflictId: string,
    resolution: ConflictResolution,
    options?: {
      readonly combined?: PlayDocument;
      readonly forkedPlayId?: string;
    },
  ): Promise<void>;
  deviceId(this: void): Promise<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function parseJsonRecord(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  return isRecord(parsed) ? parsed : {};
}

function asPlay(value: unknown): PlayDocument | undefined {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  return value as unknown as PlayDocument;
}

function mutationPayloadJson(mutation: SyncMutation): string | undefined {
  if (mutation.operation === "delete") return undefined;
  return canonicalStringify(mutation.payload);
}

export async function createSyncOrchestrator(
  options: SyncOrchestratorOptions,
): Promise<SyncOrchestrator> {
  const repository = options.repository;
  const replica = options.replica;
  const identity = options.identity;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const online = options.online ?? (() => true);
  const debounceMs = options.debounceMs ?? SYNC_DEBOUNCE_MS;
  const createId =
    options.createId ?? ((prefix: string) => createStableId(prefix));

  let status: SyncStatus = "local";
  let pendingCount = 0;
  let conflictCount = 0;
  let lastError: string | undefined;
  let headCursor: string | undefined;
  let drainTail: Promise<void> = Promise.resolve();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const snapshot = (): SyncSnapshot => ({
    status,
    pendingCount,
    conflictCount,
    ...(lastError === undefined ? {} : { lastError }),
    ...(headCursor === undefined ? {} : { headCursor }),
  });

  const refreshCounts = async () => {
    const [counts, conflicts] = await Promise.all([
      repository.counts(),
      repository.listUnresolvedConflicts(),
    ]);
    pendingCount = counts.syncMutations;
    conflictCount = conflicts.length;
  };

  const setStatus = (next: SyncStatus, error?: string) => {
    status = next;
    lastError = error;
    emit();
  };

  const readCursor = async (): Promise<string | null> => {
    const stored = await repository.getPreference(CURSOR_KEY);
    return typeof stored?.value === "string" ? stored.value : null;
  };

  const writeCursor = async (cursor: string) => {
    headCursor = cursor;
    await repository.setPreference({
      key: CURSOR_KEY,
      value: cursor,
      updatedAtMs: now(),
    });
  };

  const ensureDevice = async (): Promise<{
    deviceId: string;
    deviceLabel?: string;
  }> => {
    const existing = await repository.getPreference(DEVICE_ID_KEY);
    if (typeof existing?.value === "string") {
      const label = await repository.getPreference(DEVICE_LABEL_KEY);
      return {
        deviceId: existing.value,
        ...(typeof label?.value === "string"
          ? { deviceLabel: label.value }
          : {}),
      };
    }
    const deviceId = createId("device");
    await repository.setPreference({
      key: DEVICE_ID_KEY,
      value: deviceId,
      updatedAtMs: now(),
    });
    return { deviceId };
  };

  const toEnvelope = (mutation: SyncMutation): SyncMutationEnvelope => {
    const payloadJson = mutationPayloadJson(mutation);
    return {
      idempotencyKey: mutation.id,
      entityKind: mutation.entityKind,
      entityId: mutation.entityId,
      operation: mutation.operation,
      ...(mutation.baseRevisionId === undefined
        ? {}
        : { baseRevisionId: mutation.baseRevisionId }),
      ...(payloadJson === undefined ? {} : { payloadJson }),
      payloadHash: mutation.payloadHash,
      clientCreatedAtMs: mutation.createdAtMs,
      schemaVersion: CURRENT_WIRE_SCHEMA_VERSION,
    };
  };

  const recordConflict = async (
    playId: string,
    fields: {
      readonly conflictId: string;
      readonly localRevisionId: string;
      readonly remoteRevisionId: string;
      readonly localDocument?: PlayDocument;
      readonly remoteDocument?: PlayDocument;
      readonly playName?: string;
      readonly remotePayloadJson?: string;
    },
  ) => {
    const play = await repository.getPlay(playId);
    let remoteDocument = fields.remoteDocument;
    if (!remoteDocument && fields.remotePayloadJson) {
      try {
        remoteDocument = asPlay(parseJsonRecord(fields.remotePayloadJson));
      } catch {
        remoteDocument = undefined;
      }
    }
    const conflict: LocalConflict = {
      id: fields.conflictId,
      playId,
      localRevisionId: fields.localRevisionId,
      remoteRevisionId: fields.remoteRevisionId,
      status: "unresolved",
      createdAtMs: now(),
      playName: fields.playName ?? play?.document.name ?? playId,
      ...(fields.localDocument
        ? { localDocument: fields.localDocument }
        : play
          ? { localDocument: play.document }
          : {}),
      ...(remoteDocument ? { remoteDocument } : {}),
    };
    await repository.putConflict(conflict);
  };

  const applyChange = async (change: SyncChange): Promise<void> => {
    if (change.kind === "conflict") {
      const payload = change.payloadJson
        ? parseJsonRecord(change.payloadJson)
        : {};
      if (
        payload.status === "resolved" &&
        typeof payload.conflictId === "string"
      ) {
        const existing = await repository.listUnresolvedConflicts();
        const match = existing.find((item) => item.id === payload.conflictId);
        if (match) {
          await repository.putConflict({
            ...match,
            status: "resolved",
            resolvedAtMs: now(),
            resolution:
              payload.resolution === "local" ||
              payload.resolution === "remote" ||
              payload.resolution === "keep-both" ||
              payload.resolution === "combine"
                ? payload.resolution
                : "remote",
          });
        }
        return;
      }
      if (
        typeof payload.conflictId === "string" &&
        typeof payload.localRevisionId === "string" &&
        typeof payload.remoteRevisionId === "string"
      ) {
        await recordConflict(change.entityId, {
          conflictId: payload.conflictId,
          localRevisionId: payload.localRevisionId,
          remoteRevisionId: payload.remoteRevisionId,
          playName:
            typeof payload.playName === "string"
              ? payload.playName
              : change.playName,
          remotePayloadJson:
            typeof payload.remotePayloadJson === "string"
              ? payload.remotePayloadJson
              : undefined,
          localDocument: asPlay(
            typeof payload.localPayloadJson === "string"
              ? parseJsonRecord(payload.localPayloadJson)
              : undefined,
          ),
          remoteDocument: asPlay(
            typeof payload.remotePayloadJson === "string"
              ? parseJsonRecord(payload.remotePayloadJson)
              : undefined,
          ),
        });
      }
      return;
    }

    if (change.kind === "tombstone") {
      if (change.entityKind === "play") {
        const stored = await repository.getPlay(change.entityId);
        if (stored && stored.deletedAtMs === undefined) {
          await repository.movePlayToTrash(change.entityId);
        }
      }
      return;
    }

    if (change.entityKind === "play" && change.kind === "revision") {
      const openId = options.currentPlayId?.();
      const pending = await repository.readSyncMutationBatch(MAX_PUSH_BATCH);
      const hasLocal = pending.some(
        (mutation) =>
          mutation.entityKind === "play" &&
          mutation.entityId === change.entityId,
      );
      if (hasLocal || openId === change.entityId) {
        if (change.revisionId) {
          const local = await repository.getPlay(change.entityId);
          await recordConflict(change.entityId, {
            conflictId: createId("conflict"),
            localRevisionId:
              local?.cloudRevisionId ?? `local_${change.entityId}`,
            remoteRevisionId: change.revisionId,
            playName: change.playName ?? local?.document.name,
            localDocument: local?.document,
          });
        }
        return;
      }
      if (!change.revisionId) return;
      const revision = await replica.getRevision(change.revisionId);
      if (!revision) return;
      const document = asPlay(parseJsonRecord(revision.payloadJson));
      if (!document) return;
      await repository.applyRemotePlay({
        play: document,
        cloudRevisionId: revision.revisionId,
        revision: {
          id: revision.revisionId,
          documentHash: revision.documentHash,
          createdAtMs: revision.createdAtMs,
          parentRevisionId: revision.parentRevisionId,
        },
      });
      return;
    }

    if (change.payloadJson && change.entityKind !== "play") {
      const parsed: unknown = JSON.parse(change.payloadJson);
      if (change.entityKind === "playbook" && isRecord(parsed)) {
        await repository.savePlaybookFromRemote(parsed as unknown as Playbook);
      }
      if (change.entityKind === "formation" && isRecord(parsed)) {
        await repository.saveFormation(parsed as unknown as Formation);
      }
      if (change.entityKind === "concept" && isRecord(parsed)) {
        await repository.saveConcept(parsed as unknown as Concept);
      }
    }
  };

  const pull = async () => {
    let cursor = await readCursor();
    for (;;) {
      const page = await replica.pullAfter(cursor, MAX_PULL_PAGE);
      for (const change of page.changes) {
        await applyChange(change);
      }
      await writeCursor(page.nextCursor);
      cursor = page.nextCursor;
      if (page.isDone) {
        headCursor = page.headCursor;
        break;
      }
    }
  };

  const push = async () => {
    const device = await ensureDevice();
    const batch = await repository.readSyncMutationBatch(MAX_PUSH_BATCH);
    if (batch.length === 0) return;
    const result = await replica.pushBatch({
      mutations: batch.map((mutation) => toEnvelope(mutation)),
      deviceId: device.deviceId,
      ...(device.deviceLabel === undefined
        ? {}
        : { deviceLabel: device.deviceLabel }),
    });
    const acknowledged: string[] = [];
    for (const outcome of result.outcomes) {
      const mutation = batch.find((item) => item.id === outcome.idempotencyKey);
      if (!mutation) continue;
      if (outcome.status === "applied" || outcome.status === "duplicate") {
        acknowledged.push(mutation.id);
        if (mutation.entityKind === "play" && outcome.revisionId) {
          await repository.setPlayCloudHead(
            mutation.entityId,
            outcome.revisionId,
          );
        }
      } else if (outcome.status === "conflict") {
        acknowledged.push(mutation.id);
        const local = await repository.getPlay(mutation.entityId);
        await recordConflict(mutation.entityId, {
          conflictId: outcome.conflictId,
          localRevisionId: outcome.localRevisionId,
          remoteRevisionId: outcome.remoteRevisionId,
          localDocument: local?.document,
          remotePayloadJson: outcome.remotePayloadJson,
        });
      } else {
        await repository.scheduleSyncMutationRetry(mutation.id, {
          attempts: mutation.attempts + 1,
          nextAttemptAtMs: nextRetryAtMs(mutation.attempts + 1, now(), random),
          status: "retry",
        });
        lastError = outcome.reason;
      }
    }
    if (acknowledged.length > 0) {
      await repository.acknowledgeSyncMutations(acknowledged);
    }
    await writeCursor(result.headCursor);
  };

  const drain = async () => {
    const session = identity.getSession();
    if (session.status !== "signed_in") {
      setStatus(session.status === "unavailable" ? "local" : "signed-out");
      await refreshCounts();
      emit();
      return;
    }
    if (!online()) {
      setStatus("offline");
      await refreshCounts();
      emit();
      return;
    }
    setStatus("syncing");
    try {
      await pull();
      await push();
      await refreshCounts();
      const conflicts = conflictCount > 0;
      setStatus(
        conflicts ? "conflict" : pendingCount > 0 ? "syncing" : "synced",
      );
      if (pendingCount > 0 && status !== "conflict") {
        drainTail = drainTail.then(
          () => drain(),
          () => drain(),
        );
      }
    } catch (error) {
      await refreshCounts();
      if (error instanceof UnauthenticatedError) {
        setStatus("revoked", error.message);
        return;
      }
      setStatus(
        "offline",
        error instanceof Error ? error.message : "Sync failed",
      );
    }
  };

  const queueDrain = () => {
    drainTail = drainTail.then(
      () => drain(),
      () => drain(),
    );
    return drainTail;
  };

  await refreshCounts();
  const session = identity.getSession();
  status =
    session.status === "signed_in"
      ? pendingCount > 0
        ? "offline"
        : "synced"
      : session.status === "unavailable"
        ? "local"
        : "signed-out";

  return {
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      const stopIdentity = identity.subscribe(() => {
        void queueDrain();
      });
      const onOnline = () => {
        void queueDrain();
      };
      const onFocus = () => {
        void queueDrain();
      };
      globalThis.addEventListener?.("online", onOnline);
      globalThis.addEventListener?.("focus", onFocus);
      const stopHead = options.headWatcher?.subscribe(() => {
        void queueDrain();
      });
      void queueDrain();
      return () => {
        stopIdentity();
        stopHead?.();
        globalThis.removeEventListener?.("online", onOnline);
        globalThis.removeEventListener?.("focus", onFocus);
        if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      };
    },
    notifyLocalEdit() {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void queueDrain();
      }, debounceMs);
    },
    async syncNow() {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      await queueDrain();
      return snapshot();
    },
    async listConflicts() {
      const conflicts = await repository.listUnresolvedConflicts();
      return Promise.all(
        conflicts.map(async (conflict) => {
          const play = await repository.getPlay(conflict.playId);
          return {
            ...conflict,
            playName:
              conflict.playName ?? play?.document.name ?? conflict.playId,
            localDocument: conflict.localDocument ?? play?.document,
            remoteDocument: conflict.remoteDocument,
          };
        }),
      );
    },
    async resolveConflict(conflictId, resolution, resolveOptions) {
      const conflicts = await repository.listUnresolvedConflicts();
      const conflict = conflicts.find((item) => item.id === conflictId);
      if (!conflict) return;
      const device = await ensureDevice();
      if (resolution === "keep-both" && conflict.localDocument) {
        const forkedId = resolveOptions?.forkedPlayId ?? createId("play");
        await repository.forkPlay(conflict.localDocument, forkedId);
        await replica.resolveConflict({
          conflictId,
          resolution,
          forkedPlayId: forkedId,
          deviceId: device.deviceId,
        });
        if (conflict.remoteDocument) {
          await repository.applyRemotePlay({
            play: conflict.remoteDocument,
            cloudRevisionId: conflict.remoteRevisionId,
          });
          if (options.currentPlayId?.() === conflict.playId) {
            options.onOpenPlayChanged?.(conflict.remoteDocument);
          }
        }
      } else if (resolution === "local" && conflict.localDocument) {
        await replica.resolveConflict({
          conflictId,
          resolution,
          chosenRevisionId: conflict.localRevisionId,
          deviceId: device.deviceId,
        });
        await repository.setPlayCloudHead(
          conflict.playId,
          conflict.localRevisionId,
        );
      } else if (resolution === "remote" && conflict.remoteDocument) {
        await replica.resolveConflict({
          conflictId,
          resolution,
          chosenRevisionId: conflict.remoteRevisionId,
          deviceId: device.deviceId,
        });
        await repository.applyRemotePlay({
          play: conflict.remoteDocument,
          cloudRevisionId: conflict.remoteRevisionId,
        });
        const openId = options.currentPlayId?.();
        if (openId === conflict.playId) {
          options.onOpenPlayChanged?.(conflict.remoteDocument);
        }
      } else if (resolution === "combine" && resolveOptions?.combined) {
        const combined = resolveOptions.combined;
        const hash = await canonicalSha256(combined);
        await replica.resolveConflict({
          conflictId,
          resolution,
          combinedPayloadJson: canonicalStringify(combined),
          combinedPayloadHash: hash,
          chosenRevisionId: conflict.localRevisionId,
          deviceId: device.deviceId,
        });
        await repository.commitPlay({
          play: combined,
          mutation: {
            id: createId("mutation"),
            baseRevisionId: conflict.localRevisionId,
          },
        });
        if (options.currentPlayId?.() === conflict.playId) {
          options.onOpenPlayChanged?.(combined);
        }
      }
      await repository.putConflict({
        ...conflict,
        status: "resolved",
        resolution,
        resolvedAtMs: now(),
      });
      await refreshCounts();
      emit();
      await queueDrain();
    },
    async deviceId() {
      return (await ensureDevice()).deviceId;
    },
  };
}

export async function rememberCoachId(
  repository: ChalkLocalRepository,
  coachId: string,
  nowMs: number,
): Promise<void> {
  await repository.setPreference({
    key: COACH_ID_KEY,
    value: coachId,
    updatedAtMs: nowMs,
  });
}

export async function storedCoachId(
  repository: ChalkLocalRepository,
): Promise<string | undefined> {
  const stored = await repository.getPreference(COACH_ID_KEY);
  return typeof stored?.value === "string" ? stored.value : undefined;
}

export type { StoredPlay };
