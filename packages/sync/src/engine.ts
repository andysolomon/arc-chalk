import {
  formatSyncCursor,
  MAX_PULL_PAGE,
  MAX_PUSH_BATCH,
  MAX_REVISION_BYTES,
  parseSyncCursor,
  type ChangeKind,
  type CloudRevision,
  type EntityKind,
  type PullPage,
  type PushBatchRequest,
  type PushBatchResult,
  type PushMutationOutcome,
  type ResolveConflictRequest,
  type ResolveConflictResult,
  type SyncChange,
  type SyncMutationEnvelope,
} from "@chalk/contracts";
import {
  canonicalSha256,
  canonicalStringify,
  conceptSchema,
  formationSchema,
  migrateStoredPlayDocument,
  playbookSchema,
  type PlayDocument,
} from "@chalk/domain";

export class SyncProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncProtocolError";
  }
}

export class PayloadTooLargeError extends SyncProtocolError {
  constructor(byteLength: number) {
    super(
      `Serialized revision is ${byteLength} bytes; the limit is ${MAX_REVISION_BYTES}.`,
    );
    this.name = "PayloadTooLargeError";
  }
}

export class UnauthenticatedError extends SyncProtocolError {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class UnauthorizedError extends SyncProtocolError {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface CloudPlayHead {
  readonly entityId: string;
  readonly playbookId: string;
  readonly name: string;
  readonly unit: string;
  readonly documentHash: string;
  readonly headRevisionId: string;
  readonly updatedAtMs: number;
  readonly deletedAtMs?: number;
}

export interface CloudEntityRecord {
  readonly entityId: string;
  readonly documentHash: string;
  readonly payloadJson: string;
  readonly updatedAtMs: number;
  readonly deletedAtMs?: number;
}

export interface MutationReceipt {
  readonly coachId: string;
  readonly idempotencyKey: string;
  readonly status: "applied" | "conflict" | "rejected";
  readonly revisionId?: string;
  readonly conflictId?: string;
  readonly localRevisionId?: string;
  readonly remoteRevisionId?: string;
  readonly remotePayloadJson?: string;
  readonly reason?: string;
  readonly createdAtMs: number;
}

export interface CloudConflictRecord {
  readonly conflictId: string;
  readonly playId: string;
  readonly localRevisionId: string;
  readonly remoteRevisionId: string;
  readonly localPayloadJson: string;
  readonly remotePayloadJson: string;
  readonly playName: string;
  readonly deviceId: string;
  readonly deviceLabel?: string;
  readonly createdAtMs: number;
  readonly status: "unresolved" | "resolved";
  readonly resolution?: ResolveConflictRequest["resolution"];
  readonly resolvedAtMs?: number;
}

export interface ReplicaStore {
  getReceipt(
    coachId: string,
    idempotencyKey: string,
  ): Promise<MutationReceipt | null>;
  putReceipt(receipt: MutationReceipt): Promise<void>;
  getPlay(coachId: string, playId: string): Promise<CloudPlayHead | null>;
  putPlay(coachId: string, play: CloudPlayHead): Promise<void>;
  getEntity(
    coachId: string,
    kind: Exclude<EntityKind, "play">,
    entityId: string,
  ): Promise<CloudEntityRecord | null>;
  putEntity(
    coachId: string,
    kind: Exclude<EntityKind, "play">,
    record: CloudEntityRecord,
  ): Promise<void>;
  getRevision(
    coachId: string,
    revisionId: string,
  ): Promise<CloudRevision | null>;
  putRevision(coachId: string, revision: CloudRevision): Promise<void>;
  getConflict(
    coachId: string,
    conflictId: string,
  ): Promise<CloudConflictRecord | null>;
  putConflict(coachId: string, conflict: CloudConflictRecord): Promise<void>;
  advanceHead(
    coachId: string,
    nowMs: number,
  ): Promise<{ seq: number; cursor: string }>;
  getHead(coachId: string): Promise<{ seq: number; cursor: string }>;
  appendChange(coachId: string, change: SyncChange): Promise<void>;
  listChangesAfter(
    coachId: string,
    afterSeq: number,
    limit: number,
  ): Promise<readonly SyncChange[]>;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function outcomeFromReceipt(receipt: MutationReceipt): PushMutationOutcome {
  if (receipt.status === "applied") {
    return {
      idempotencyKey: receipt.idempotencyKey,
      status: "duplicate",
      ...(receipt.revisionId === undefined
        ? {}
        : { revisionId: receipt.revisionId }),
    };
  }
  if (receipt.status === "conflict") {
    return {
      idempotencyKey: receipt.idempotencyKey,
      status: "conflict",
      conflictId: receipt.conflictId ?? "",
      localRevisionId: receipt.localRevisionId ?? "",
      remoteRevisionId: receipt.remoteRevisionId ?? "",
      ...(receipt.remotePayloadJson === undefined
        ? {}
        : { remotePayloadJson: receipt.remotePayloadJson }),
    };
  }
  return {
    idempotencyKey: receipt.idempotencyKey,
    status: "rejected",
    reason: receipt.reason ?? "Previously rejected",
  };
}

async function hashJson(payloadJson: string): Promise<string> {
  return canonicalSha256(JSON.parse(payloadJson) as unknown);
}

function parsePlayPayload(
  payloadJson: string,
  playbookId: string | undefined,
): PlayDocument {
  const parsed: unknown = JSON.parse(payloadJson);
  const record =
    parsed !== null && typeof parsed === "object"
      ? (parsed as { playbookId?: unknown })
      : {};
  const knownPlaybookId =
    playbookId ??
    (typeof record.playbookId === "string" ? record.playbookId : undefined);
  if (!knownPlaybookId) {
    throw new SyncProtocolError("Play payload is missing a Playbook.");
  }
  return migrateStoredPlayDocument(parsed, knownPlaybookId);
}

export async function applyPushBatch(
  store: ReplicaStore,
  coachId: string,
  request: PushBatchRequest,
  nowMs: number,
): Promise<PushBatchResult> {
  if (request.mutations.length === 0) {
    const head = await store.getHead(coachId);
    return { outcomes: [], headCursor: head.cursor };
  }
  if (request.mutations.length > MAX_PUSH_BATCH) {
    throw new SyncProtocolError(
      `A push batch may contain at most ${MAX_PUSH_BATCH} mutations.`,
    );
  }

  const outcomes: PushMutationOutcome[] = [];
  for (const mutation of request.mutations) {
    outcomes.push(
      await applyOneMutation(store, coachId, mutation, request, nowMs),
    );
  }
  const head = await store.getHead(coachId);
  return { outcomes, headCursor: head.cursor };
}

async function applyOneMutation(
  store: ReplicaStore,
  coachId: string,
  mutation: SyncMutationEnvelope,
  request: PushBatchRequest,
  nowMs: number,
): Promise<PushMutationOutcome> {
  const existing = await store.getReceipt(coachId, mutation.idempotencyKey);
  if (existing) return outcomeFromReceipt(existing);

  if (mutation.payloadJson !== undefined) {
    const bytes = utf8Bytes(mutation.payloadJson);
    if (bytes > MAX_REVISION_BYTES) {
      const receipt: MutationReceipt = {
        coachId,
        idempotencyKey: mutation.idempotencyKey,
        status: "rejected",
        reason: `Serialized revision is ${bytes} bytes; the limit is ${MAX_REVISION_BYTES}.`,
        createdAtMs: nowMs,
      };
      await store.putReceipt(receipt);
      return {
        idempotencyKey: mutation.idempotencyKey,
        status: "rejected",
        reason: receipt.reason ?? "",
      };
    }
  }

  try {
    if (mutation.operation === "delete") {
      return await applyDelete(store, coachId, mutation, request, nowMs);
    }
    if (mutation.entityKind === "play") {
      return await applyPlayPut(store, coachId, mutation, request, nowMs);
    }
    return await applyEntityPut(store, coachId, mutation, request, nowMs);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Mutation could not be applied.";
    const receipt: MutationReceipt = {
      coachId,
      idempotencyKey: mutation.idempotencyKey,
      status: "rejected",
      reason,
      createdAtMs: nowMs,
    };
    await store.putReceipt(receipt);
    return {
      idempotencyKey: mutation.idempotencyKey,
      status: "rejected",
      reason,
    };
  }
}

async function append(
  store: ReplicaStore,
  coachId: string,
  nowMs: number,
  fields: {
    readonly kind: ChangeKind;
    readonly entityKind: EntityKind;
    readonly entityId: string;
    readonly revisionId?: string;
    readonly documentHash?: string;
    readonly payloadJson?: string;
    readonly playName?: string;
    readonly deviceId?: string;
    readonly deviceLabel?: string;
  },
): Promise<SyncChange> {
  const head = await store.advanceHead(coachId, nowMs);
  const change: SyncChange = {
    cursor: head.cursor,
    seq: head.seq,
    kind: fields.kind,
    entityKind: fields.entityKind,
    entityId: fields.entityId,
    createdAtMs: nowMs,
    ...(fields.revisionId === undefined
      ? {}
      : { revisionId: fields.revisionId }),
    ...(fields.documentHash === undefined
      ? {}
      : { documentHash: fields.documentHash }),
    ...(fields.payloadJson === undefined
      ? {}
      : { payloadJson: fields.payloadJson }),
    ...(fields.playName === undefined ? {} : { playName: fields.playName }),
    ...(fields.deviceId === undefined ? {} : { deviceId: fields.deviceId }),
    ...(fields.deviceLabel === undefined
      ? {}
      : { deviceLabel: fields.deviceLabel }),
  };
  await store.appendChange(coachId, change);
  return change;
}

async function applyDelete(
  store: ReplicaStore,
  coachId: string,
  mutation: SyncMutationEnvelope,
  request: PushBatchRequest,
  nowMs: number,
): Promise<PushMutationOutcome> {
  const revisionId = `revision_${mutation.idempotencyKey}`;
  if (mutation.entityKind === "play") {
    const current = await store.getPlay(coachId, mutation.entityId);
    if (current && current.deletedAtMs === undefined) {
      await store.putPlay(coachId, {
        ...current,
        deletedAtMs: nowMs,
        updatedAtMs: nowMs,
      });
    }
  } else {
    const current = await store.getEntity(
      coachId,
      mutation.entityKind,
      mutation.entityId,
    );
    if (current && current.deletedAtMs === undefined) {
      await store.putEntity(coachId, mutation.entityKind, {
        ...current,
        deletedAtMs: nowMs,
        updatedAtMs: nowMs,
      });
    }
  }
  const change = await append(store, coachId, nowMs, {
    kind: "tombstone",
    entityKind: mutation.entityKind,
    entityId: mutation.entityId,
    revisionId,
    deviceId: request.deviceId,
    deviceLabel: request.deviceLabel,
  });
  await store.putReceipt({
    coachId,
    idempotencyKey: mutation.idempotencyKey,
    status: "applied",
    revisionId,
    createdAtMs: nowMs,
  });
  return {
    idempotencyKey: mutation.idempotencyKey,
    status: "applied",
    revisionId,
    cursor: change.cursor,
  };
}

async function applyPlayPut(
  store: ReplicaStore,
  coachId: string,
  mutation: SyncMutationEnvelope,
  request: PushBatchRequest,
  nowMs: number,
): Promise<PushMutationOutcome> {
  if (!mutation.payloadJson) {
    throw new SyncProtocolError("A Play put requires a payload.");
  }
  const actualHash = await hashJson(mutation.payloadJson);
  if (actualHash !== mutation.payloadHash) {
    throw new SyncProtocolError(
      "Play payload hash does not match its document.",
    );
  }
  const current = await store.getPlay(coachId, mutation.entityId);
  const play = parsePlayPayload(mutation.payloadJson, current?.playbookId);
  if (play.id !== mutation.entityId) {
    throw new SyncProtocolError("Play payload id does not match the mutation.");
  }

  const remoteHead = current?.deletedAtMs ? undefined : current;
  if (
    remoteHead &&
    remoteHead.headRevisionId !== (mutation.baseRevisionId ?? "")
  ) {
    const conflictId = `conflict_${mutation.idempotencyKey}`;
    const localRevisionId = `revision_${mutation.idempotencyKey}`;
    const remote = await store.getRevision(coachId, remoteHead.headRevisionId);
    await store.putRevision(coachId, {
      revisionId: localRevisionId,
      playId: play.id,
      parentRevisionId: mutation.baseRevisionId,
      documentHash: mutation.payloadHash,
      payloadJson: canonicalStringify(play),
      schemaVersion: play.schemaVersion,
      createdAtMs: nowMs,
      deviceId: request.deviceId,
      ...(request.deviceLabel === undefined
        ? {}
        : { deviceLabel: request.deviceLabel }),
    });
    const remotePayloadJson = remote?.payloadJson ?? "";
    await store.putConflict(coachId, {
      conflictId,
      playId: play.id,
      localRevisionId,
      remoteRevisionId: remoteHead.headRevisionId,
      localPayloadJson: canonicalStringify(play),
      remotePayloadJson,
      playName: play.name,
      deviceId: request.deviceId,
      ...(request.deviceLabel === undefined
        ? {}
        : { deviceLabel: request.deviceLabel }),
      createdAtMs: nowMs,
      status: "unresolved",
    });
    await append(store, coachId, nowMs, {
      kind: "conflict",
      entityKind: "play",
      entityId: play.id,
      revisionId: localRevisionId,
      documentHash: mutation.payloadHash,
      payloadJson: JSON.stringify({
        conflictId,
        localRevisionId,
        remoteRevisionId: remoteHead.headRevisionId,
        localPayloadJson: canonicalStringify(play),
        remotePayloadJson,
        playName: play.name,
        localDeviceLabel: request.deviceLabel,
        remoteDeviceLabel: remote?.deviceLabel,
        localUpdatedAtMs: nowMs,
        remoteUpdatedAtMs: remote?.createdAtMs ?? remoteHead.updatedAtMs,
      }),
      playName: play.name,
      deviceId: request.deviceId,
      deviceLabel: request.deviceLabel,
    });
    await store.putReceipt({
      coachId,
      idempotencyKey: mutation.idempotencyKey,
      status: "conflict",
      conflictId,
      localRevisionId,
      remoteRevisionId: remoteHead.headRevisionId,
      remotePayloadJson,
      createdAtMs: nowMs,
    });
    return {
      idempotencyKey: mutation.idempotencyKey,
      status: "conflict",
      conflictId,
      localRevisionId,
      remoteRevisionId: remoteHead.headRevisionId,
      remotePayloadJson,
    };
  }

  const revisionId = `revision_${mutation.idempotencyKey}`;
  const payloadJson = canonicalStringify(play);
  await store.putRevision(coachId, {
    revisionId,
    playId: play.id,
    ...(mutation.baseRevisionId === undefined
      ? {}
      : { parentRevisionId: mutation.baseRevisionId }),
    documentHash: mutation.payloadHash,
    payloadJson,
    schemaVersion: play.schemaVersion,
    createdAtMs: nowMs,
    deviceId: request.deviceId,
    ...(request.deviceLabel === undefined
      ? {}
      : { deviceLabel: request.deviceLabel }),
  });
  await store.putPlay(coachId, {
    entityId: play.id,
    playbookId: play.playbookId,
    name: play.name,
    unit: play.unit,
    documentHash: mutation.payloadHash,
    headRevisionId: revisionId,
    updatedAtMs: nowMs,
  });
  const meta = {
    playId: play.id,
    playbookId: play.playbookId,
    name: play.name,
    unit: play.unit,
    documentHash: mutation.payloadHash,
    headRevisionId: revisionId,
  };
  await append(store, coachId, nowMs, {
    kind: "play_meta",
    entityKind: "play",
    entityId: play.id,
    revisionId,
    documentHash: mutation.payloadHash,
    payloadJson: JSON.stringify(meta),
    playName: play.name,
    deviceId: request.deviceId,
    deviceLabel: request.deviceLabel,
  });
  const change = await append(store, coachId, nowMs, {
    kind: "revision",
    entityKind: "play",
    entityId: play.id,
    revisionId,
    documentHash: mutation.payloadHash,
    playName: play.name,
    deviceId: request.deviceId,
    deviceLabel: request.deviceLabel,
  });
  await store.putReceipt({
    coachId,
    idempotencyKey: mutation.idempotencyKey,
    status: "applied",
    revisionId,
    createdAtMs: nowMs,
  });
  return {
    idempotencyKey: mutation.idempotencyKey,
    status: "applied",
    revisionId,
    cursor: change.cursor,
  };
}

async function applyEntityPut(
  store: ReplicaStore,
  coachId: string,
  mutation: SyncMutationEnvelope,
  request: PushBatchRequest,
  nowMs: number,
): Promise<PushMutationOutcome> {
  if (!mutation.payloadJson) {
    throw new SyncProtocolError("A put requires a payload.");
  }
  const parsed: unknown = JSON.parse(mutation.payloadJson);
  const document =
    mutation.entityKind === "playbook"
      ? playbookSchema.parse(parsed)
      : mutation.entityKind === "concept"
        ? conceptSchema.parse(parsed)
        : formationSchema.parse(parsed);
  const payloadJson = canonicalStringify(document);
  const actualHash = await canonicalSha256(document);
  if (actualHash !== mutation.payloadHash) {
    throw new SyncProtocolError("Payload hash does not match its document.");
  }
  const revisionId = `revision_${mutation.idempotencyKey}`;
  if (mutation.entityKind === "play") {
    throw new SyncProtocolError("Play puts cannot use the catalog path.");
  }
  await store.putEntity(coachId, mutation.entityKind, {
    entityId: mutation.entityId,
    documentHash: actualHash,
    payloadJson,
    updatedAtMs: nowMs,
  });
  const kind: ChangeKind =
    mutation.entityKind === "playbook"
      ? "playbook"
      : mutation.entityKind === "concept"
        ? "concept"
        : "formation";
  const change = await append(store, coachId, nowMs, {
    kind,
    entityKind: mutation.entityKind,
    entityId: mutation.entityId,
    revisionId,
    documentHash: actualHash,
    payloadJson,
    deviceId: request.deviceId,
    deviceLabel: request.deviceLabel,
  });
  await store.putReceipt({
    coachId,
    idempotencyKey: mutation.idempotencyKey,
    status: "applied",
    revisionId,
    createdAtMs: nowMs,
  });
  return {
    idempotencyKey: mutation.idempotencyKey,
    status: "applied",
    revisionId,
    cursor: change.cursor,
  };
}

export async function applyPullAfter(
  store: ReplicaStore,
  coachId: string,
  cursor: string | null,
  limit: number,
): Promise<PullPage> {
  const afterSeq = parseSyncCursor(cursor);
  const pageSize = Math.min(Math.max(1, limit), MAX_PULL_PAGE);
  const changes = await store.listChangesAfter(coachId, afterSeq, pageSize);
  const head = await store.getHead(coachId);
  const last = changes[changes.length - 1];
  return {
    changes,
    nextCursor: last?.cursor ?? formatSyncCursor(afterSeq),
    isDone:
      changes.length < pageSize || (last !== undefined && last.seq >= head.seq),
    headCursor: head.cursor,
  };
}

export async function applyResolveConflict(
  store: ReplicaStore,
  coachId: string,
  request: ResolveConflictRequest,
  nowMs: number,
): Promise<ResolveConflictResult> {
  const conflict = await store.getConflict(coachId, request.conflictId);
  if (!conflict) throw new SyncProtocolError("Conflict not found");
  if (conflict.status === "resolved") {
    const head = await store.getHead(coachId);
    return {
      conflictId: conflict.conflictId,
      resolution: conflict.resolution ?? request.resolution,
      ...(conflict.remoteRevisionId === undefined
        ? {}
        : { headRevisionId: conflict.remoteRevisionId }),
      cursor: head.cursor,
    };
  }

  const play = await store.getPlay(coachId, conflict.playId);
  if (!play) throw new SyncProtocolError("Conflicting Play is missing.");

  let headRevisionId: string;
  if (request.resolution === "local") {
    headRevisionId = conflict.localRevisionId;
    const local = await store.getRevision(coachId, conflict.localRevisionId);
    if (!local)
      throw new SyncProtocolError("Local branch revision is missing.");
    const document = parsePlayPayload(local.payloadJson, play.playbookId);
    await store.putPlay(coachId, {
      ...play,
      name: document.name,
      documentHash: local.documentHash,
      headRevisionId,
      updatedAtMs: nowMs,
    });
  } else if (request.resolution === "combine") {
    if (!request.combinedPayloadJson || !request.combinedPayloadHash) {
      throw new SyncProtocolError("Manual combine needs a combined Play.");
    }
    const document = parsePlayPayload(
      request.combinedPayloadJson,
      play.playbookId,
    );
    const revisionId = `revision_combine_${request.conflictId}`;
    const payloadJson = canonicalStringify(document);
    const hash = await canonicalSha256(document);
    if (hash !== request.combinedPayloadHash) {
      throw new SyncProtocolError("Combined Play hash does not match.");
    }
    await store.putRevision(coachId, {
      revisionId,
      playId: play.entityId,
      parentRevisionId: request.chosenRevisionId ?? conflict.localRevisionId,
      documentHash: hash,
      payloadJson,
      schemaVersion: document.schemaVersion,
      createdAtMs: nowMs,
      deviceId: request.deviceId,
    });
    headRevisionId = revisionId;
    await store.putPlay(coachId, {
      ...play,
      name: document.name,
      documentHash: hash,
      headRevisionId,
      updatedAtMs: nowMs,
    });
  } else if (request.resolution === "keep-both") {
    headRevisionId = conflict.remoteRevisionId;
  } else {
    headRevisionId = conflict.remoteRevisionId;
  }

  await store.putConflict(coachId, {
    ...conflict,
    status: "resolved",
    resolution: request.resolution,
    resolvedAtMs: nowMs,
  });
  const change = await append(store, coachId, nowMs, {
    kind: "conflict",
    entityKind: "play",
    entityId: conflict.playId,
    revisionId: headRevisionId,
    payloadJson: JSON.stringify({
      conflictId: conflict.conflictId,
      status: "resolved",
      resolution: request.resolution,
      forkedPlayId: request.forkedPlayId,
    }),
    playName: conflict.playName,
    deviceId: request.deviceId,
  });
  if (request.resolution === "local" || request.resolution === "combine") {
    await append(store, coachId, nowMs, {
      kind: "revision",
      entityKind: "play",
      entityId: conflict.playId,
      revisionId: headRevisionId,
      deviceId: request.deviceId,
    });
  }
  return {
    conflictId: conflict.conflictId,
    resolution: request.resolution,
    headRevisionId,
    cursor: change.cursor,
  };
}

export async function readRevision(
  store: ReplicaStore,
  coachId: string,
  revisionId: string,
): Promise<CloudRevision | null> {
  return store.getRevision(coachId, revisionId);
}
