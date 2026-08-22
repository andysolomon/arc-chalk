import {
  backupPayloadSchema,
  canonicalSha256,
  readBackupPayload,
  conceptSchema,
  formationSchema,
  migrateStoredPlayDocument,
  playDocumentSchema,
  playRevisionSchema,
  playbookEnvelopeSchema,
  playbookSchema,
  undoHistorySchema,
  type BackupPayload,
  type Concept,
  type Formation,
  type PlayDocument,
  type PlayRevision,
  type Playbook,
  type PlaybookEnvelope,
} from "@chalk/domain";

import { CHALK_LOCAL_DATABASE_VERSION, ChalkDexieDatabase } from "./database";
import { TRASH_RETENTION_MS } from "./types";
import type {
  BackupImportOptions,
  BackupImportResult,
  ChalkLocalRepository,
  CommitPlayInput,
  CommitPlayResult,
  CreateNamedVersionInput,
  LocalConflict,
  LocalImageBlob,
  LocalPreference,
  LocalRepositoryOptions,
  JsonValue,
  LocalStoreCounts,
  PlaySearchProjection,
  PlayVersionSummary,
  SessionRecovery,
  StorageHealth,
  StorageManagerLike,
  StoragePressure,
  StoredPlay,
  TrashedPlaySummary,
  SyncMutation,
  ThumbnailDerivative,
  UndoHistory,
} from "./types";

export class StaleLocalPlayError extends Error {
  constructor(readonly playId: string) {
    super(`Play ${playId} changed before this local commit.`);
    this.name = "StaleLocalPlayError";
  }
}

export class CorruptLocalDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorruptLocalDataError";
  }
}

function projectionFor(
  play: PlayDocument,
  documentHash: string,
  updatedAtMs: number,
): PlaySearchProjection {
  return {
    playId: play.id,
    playbookId: play.playbookId,
    name: play.name,
    unit: play.unit,
    ...(play.playType === undefined
      ? {}
      : {
          playTypeId: play.playType.id,
          playTypeName: play.playType.name,
        }),
    ...(play.conceptSource === undefined
      ? {}
      : { conceptId: play.conceptSource.conceptId }),
    ...(play.formationSource === undefined
      ? {}
      : { formationId: play.formationSource.formationId }),
    ...(play.personnelLabel === undefined
      ? {}
      : { personnelLabel: play.personnelLabel }),
    tags: [...play.tags],
    playerRoles: play.players.flatMap(({ role }) => (role ? [role] : [])),
    assignmentText: play.assignments.flatMap(({ text }) =>
      text.trim() ? [text] : [],
    ),
    notes: play.notes,
    documentHash,
    updatedAtMs,
  };
}

/** Rebuilds a Play record without its Trash mark. */
function withoutTrashMark(play: StoredPlay): StoredPlay {
  return {
    id: play.id,
    playbookId: play.playbookId,
    document: play.document,
    documentHash: play.documentHash,
    ...(play.currentRevisionId === undefined
      ? {}
      : { currentRevisionId: play.currentRevisionId }),
    updatedAtMs: play.updatedAtMs,
  };
}

function positiveLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError(
      "A sync mutation batch limit must be between 1 and 100.",
    );
  }
  return limit;
}

const OPEN_SESSION_PREFERENCE = "session.open";
const STORAGE_WATCH_FRACTION = 0.8;
const STORAGE_CRITICAL_FRACTION = 0.95;

function pressureFor(usedFraction: number | undefined): StoragePressure {
  if (usedFraction === undefined) return "unknown";
  if (usedFraction >= STORAGE_CRITICAL_FRACTION) return "critical";
  if (usedFraction >= STORAGE_WATCH_FRACTION) return "watch";
  return "healthy";
}

class DexieLocalRepository implements ChalkLocalRepository {
  readonly #database: ChalkDexieDatabase;
  readonly #now: () => number;
  readonly #storage: StorageManagerLike | undefined;

  constructor(options: LocalRepositoryOptions) {
    this.#database = new ChalkDexieDatabase(options.databaseName, {
      indexedDB: options.indexedDB,
      IDBKeyRange: options.IDBKeyRange,
    });
    this.#now = options.now ?? Date.now;
    this.#storage =
      options.storage ??
      (typeof navigator === "undefined" ? undefined : navigator.storage);
  }

  async open(): Promise<void> {
    await this.#database.open();
  }

  close(): void {
    this.#database.close();
  }

  async destroy(): Promise<void> {
    this.#database.close();
    await this.#database.delete();
  }

  async savePlaybook(input: PlaybookEnvelope): Promise<void> {
    const envelope = playbookEnvelopeSchema.parse(input);
    const storedPlays = await Promise.all(
      envelope.plays.map(async (document): Promise<StoredPlay> => {
        const documentHash = await canonicalSha256(document);
        return {
          id: document.id,
          playbookId: document.playbookId,
          document,
          documentHash,
          updatedAtMs: envelope.playbook.updatedAtMs,
        };
      }),
    );
    const projections = storedPlays.map(({ document, documentHash }) =>
      projectionFor(document, documentHash, envelope.playbook.updatedAtMs),
    );

    await this.#database.transaction(
      "rw",
      this.#database.playbooks,
      this.#database.concepts,
      this.#database.formations,
      this.#database.plays,
      this.#database.searchProjections,
      async () => {
        await this.#database.playbooks.put(envelope.playbook);
        await this.#database.concepts.bulkPut(envelope.concepts);
        await this.#database.formations.bulkPut(envelope.formations);
        await this.#database.plays.bulkPut(storedPlays);
        await this.#database.searchProjections.bulkPut(projections);
      },
    );
  }

  async loadPlaybook(
    playbookId: string,
  ): Promise<PlaybookEnvelope | undefined> {
    const playbookRecord = await this.#database.playbooks.get(playbookId);
    if (!playbookRecord) return undefined;
    const playbook = playbookSchema.parse(playbookRecord);
    const [conceptRecords, formationRecords, storedPlays] = await Promise.all([
      this.#database.concepts.where("playbookId").equals(playbookId).toArray(),
      this.#database.formations
        .where("playbookId")
        .equals(playbookId)
        .toArray(),
      this.#database.plays.where("playbookId").equals(playbookId).toArray(),
    ]);
    const plays = await Promise.all(
      storedPlays
        .filter(({ deletedAtMs }) => deletedAtMs === undefined)
        .map((record) => this.#validatedPlay(record)),
    );

    return playbookEnvelopeSchema.parse({
      schemaVersion: 1,
      kind: "chalk-playbook",
      exportedAtMs: playbook.updatedAtMs,
      playbook,
      concepts: conceptRecords.map((value) => conceptSchema.parse(value)),
      formations: formationRecords.map((value) => formationSchema.parse(value)),
      plays: plays.map(({ document }) => document),
    });
  }

  async getPlay(playId: string): Promise<StoredPlay | undefined> {
    const record = await this.#database.plays.get(playId);
    return record ? this.#validatedPlay(record) : undefined;
  }

  async listPlaySummaries(
    playbookId: string,
  ): Promise<readonly PlaySearchProjection[]> {
    const values = await this.#database.searchProjections
      .where("playbookId")
      .equals(playbookId)
      .toArray();
    return values.sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.playId.localeCompare(right.playId),
    );
  }

  async commitPlay(input: CommitPlayInput): Promise<CommitPlayResult> {
    const play = playDocumentSchema.parse(input.play);
    const documentHash = await canonicalSha256(play);
    const committedAtMs = this.#now();
    const undoHistory = input.undoHistory
      ? undoHistorySchema.parse(input.undoHistory)
      : undefined;
    if (undoHistory && undoHistory.playId !== play.id) {
      throw new CorruptLocalDataError(
        `Undo history for Play ${undoHistory.playId} cannot be committed with Play ${play.id}.`,
      );
    }

    return this.#database.transaction(
      "rw",
      [
        this.#database.playbooks,
        this.#database.concepts,
        this.#database.formations,
        this.#database.plays,
        this.#database.revisions,
        this.#database.syncMutations,
        this.#database.searchProjections,
        this.#database.undoHistories,
      ],
      async () => {
        const [playbook, concepts, formations, existing] = await Promise.all([
          this.#database.playbooks.get(play.playbookId),
          this.#database.concepts
            .where("playbookId")
            .equals(play.playbookId)
            .toArray(),
          this.#database.formations
            .where("playbookId")
            .equals(play.playbookId)
            .toArray(),
          this.#database.plays.get(play.id),
        ]);
        if (!playbook) {
          throw new CorruptLocalDataError(
            `Cannot commit Play ${play.id} without Playbook ${play.playbookId}.`,
          );
        }
        playbookEnvelopeSchema.parse({
          schemaVersion: 1,
          kind: "chalk-playbook",
          exportedAtMs: committedAtMs,
          playbook,
          concepts,
          formations,
          plays: [play],
        });
        if (
          input.expectedDocumentHash !== undefined &&
          existing?.documentHash !== input.expectedDocumentHash
        ) {
          throw new StaleLocalPlayError(play.id);
        }
        if (existing?.deletedAtMs !== undefined) {
          throw new CorruptLocalDataError(
            `Play ${play.id} is in the Trash and must be restored before editing.`,
          );
        }

        let revision: PlayRevision | undefined;
        if (input.revision) {
          revision = playRevisionSchema.parse({
            schemaVersion: 1,
            id: input.revision.id,
            playId: play.id,
            ...(existing?.currentRevisionId
              ? { parentRevisionId: existing.currentRevisionId }
              : {}),
            createdAtMs: committedAtMs,
            ...(input.revision.label === undefined
              ? {}
              : { label: input.revision.label }),
            documentHash,
            document: play,
          });
        }

        const baseRevisionId =
          input.mutation?.baseRevisionId ?? existing?.cloudRevisionId;
        let mutation: SyncMutation | undefined;
        if (input.mutation) {
          mutation = {
            id: input.mutation.id,
            entityKind: "play",
            entityId: play.id,
            operation: "put",
            ...(baseRevisionId === undefined ? {} : { baseRevisionId }),
            payloadHash: documentHash,
            payload: play,
            status: "pending",
            attempts: 0,
            createdAtMs: committedAtMs,
            nextAttemptAtMs: committedAtMs,
          };
        }

        const stored: StoredPlay = {
          id: play.id,
          playbookId: play.playbookId,
          document: play,
          documentHash,
          ...(revision
            ? { currentRevisionId: revision.id }
            : existing?.currentRevisionId
              ? { currentRevisionId: existing.currentRevisionId }
              : {}),
          ...(existing?.cloudRevisionId
            ? { cloudRevisionId: existing.cloudRevisionId }
            : {}),
          updatedAtMs: committedAtMs,
        };
        await this.#database.plays.put(stored);
        if (revision) await this.#database.revisions.add(revision);
        if (mutation) await this.#database.syncMutations.add(mutation);
        await this.#database.searchProjections.put(
          projectionFor(play, documentHash, committedAtMs),
        );
        if (undoHistory) {
          await this.#database.undoHistories.put(structuredClone(undoHistory));
        }

        return {
          playId: play.id,
          documentHash,
          committedAtMs,
          ...(revision ? { revisionId: revision.id } : {}),
          ...(mutation ? { mutationId: mutation.id } : {}),
          ...(undoHistory ? { undoEntryCount: undoHistory.undo.length } : {}),
        };
      },
    );
  }

  async getRevision(revisionId: string): Promise<PlayRevision | undefined> {
    const value = await this.#database.revisions.get(revisionId);
    if (!value) return undefined;
    const revision = playRevisionSchema.parse(value);
    const documentHash = await canonicalSha256(revision.document);
    if (documentHash !== revision.documentHash) {
      throw new CorruptLocalDataError(
        `Stored revision ${revision.id} does not match its document hash.`,
      );
    }
    return revision;
  }

  /**
   * Marks the Play as it stands now with a Coach-chosen label. The document is
   * untouched, and an existing version can never be renamed or overwritten
   * because revision IDs are added, never put.
   */
  async createNamedVersion(
    input: CreateNamedVersionInput,
  ): Promise<PlayRevision> {
    const label = input.label.trim();
    if (!label) {
      throw new RangeError("A named version needs a label the Coach chose.");
    }
    // Hashing cannot happen inside a Dexie transaction, so the Play is read and
    // verified first and the write re-checks that it did not move underneath.
    const stored = await this.getPlay(input.playId);
    if (!stored) {
      throw new CorruptLocalDataError(
        `Cannot version Play ${input.playId} because it is not stored.`,
      );
    }
    const revision = playRevisionSchema.parse({
      schemaVersion: 1,
      id: input.revisionId,
      playId: stored.id,
      ...(stored.currentRevisionId
        ? { parentRevisionId: stored.currentRevisionId }
        : {}),
      createdAtMs: this.#now(),
      label,
      documentHash: stored.documentHash,
      document: stored.document,
    });

    return this.#database.transaction(
      "rw",
      [this.#database.plays, this.#database.revisions],
      async () => {
        const current = await this.#database.plays.get(input.playId);
        if (
          !current ||
          current.documentHash !== stored.documentHash ||
          current.currentRevisionId !== stored.currentRevisionId
        ) {
          throw new StaleLocalPlayError(input.playId);
        }
        await this.#database.revisions.add(revision);
        await this.#database.plays.put({
          ...current,
          currentRevisionId: revision.id,
        });
        return revision;
      },
    );
  }

  /** Metadata only: a Playbook's history must not load every whole document. */
  async listPlayVersions(
    playId: string,
  ): Promise<readonly PlayVersionSummary[]> {
    const revisions = await this.#database.revisions
      .where("playId")
      .equals(playId)
      .toArray();
    return revisions
      .map(
        ({
          id,
          playId: owner,
          label,
          createdAtMs,
          documentHash,
          parentRevisionId,
        }) => ({
          id,
          playId: owner,
          ...(label === undefined ? {} : { label }),
          createdAtMs,
          documentHash,
          ...(parentRevisionId === undefined ? {} : { parentRevisionId }),
        }),
      )
      .sort(
        (left, right) =>
          right.createdAtMs - left.createdAtMs ||
          right.id.localeCompare(left.id),
      );
  }

  /**
   * A backup carries the Coach's authoritative work and its immutable history.
   * Device-local queues, conflicts, undo history, and derived previews stay
   * behind: they belong to one device, not to the season.
   */
  async exportBackup(): Promise<BackupPayload> {
    const [
      playbooks,
      concepts,
      formations,
      storedPlays,
      revisions,
      preferences,
    ] = await Promise.all([
      this.#database.playbooks.toArray(),
      this.#database.concepts.toArray(),
      this.#database.formations.toArray(),
      this.#database.plays.toArray(),
      this.#database.revisions.toArray(),
      this.#database.preferences.toArray(),
    ]);

    const plays = await Promise.all(
      storedPlays.map(async (record) => {
        // Validating here means a backup always holds current, coherent Plays
        // even when the device still stores an older shape.
        const play = await this.#validatedPlay(record);
        return {
          playId: play.id,
          playbookId: play.playbookId,
          document: play.document,
          updatedAtMs: play.updatedAtMs,
          ...(play.currentRevisionId === undefined
            ? {}
            : { currentRevisionId: play.currentRevisionId }),
          ...(play.deletedAtMs === undefined
            ? {}
            : { deletedAtMs: play.deletedAtMs }),
        };
      }),
    );

    return backupPayloadSchema.parse({
      schemaVersion: 1,
      kind: "chalk-backup",
      createdAtMs: this.#now(),
      databaseVersion: CHALK_LOCAL_DATABASE_VERSION,
      playbooks,
      concepts,
      formations,
      plays,
      revisions,
      // A session marker describes the device that wrote the backup, not the
      // device that will read it.
      preferences: preferences.filter(
        ({ key }) => key !== OPEN_SESSION_PREFERENCE,
      ),
    });
  }

  /**
   * Restores a backup in one transaction, so a Coach is never left with half
   * of a season. Merging never overwrites a newer local Play or an immutable
   * version already stored; replacing is the explicit way to discard.
   */
  async importBackup(
    payload: BackupPayload,
    { mode = "merge" }: BackupImportOptions = {},
  ): Promise<BackupImportResult> {
    // Written strictly, read leniently: a file an earlier release wrote has its
    // Plays upgraded here rather than being refused.
    const backup = readBackupPayload(payload);
    // Hashing every Play before opening the transaction keeps the write atomic.
    const plays = await Promise.all(
      backup.plays.map(async (play) => {
        const documentHash = await canonicalSha256(play.document);
        const stored: StoredPlay = {
          id: play.playId,
          playbookId: play.playbookId,
          document: play.document,
          documentHash,
          ...(play.currentRevisionId === undefined
            ? {}
            : { currentRevisionId: play.currentRevisionId }),
          updatedAtMs: play.updatedAtMs,
          ...(play.deletedAtMs === undefined
            ? {}
            : { deletedAtMs: play.deletedAtMs }),
        };
        return {
          stored,
          projection: projectionFor(
            play.document,
            documentHash,
            play.updatedAtMs,
          ),
        };
      }),
    );

    return this.#database.transaction(
      "rw",
      [
        this.#database.playbooks,
        this.#database.concepts,
        this.#database.formations,
        this.#database.plays,
        this.#database.revisions,
        this.#database.preferences,
        this.#database.searchProjections,
      ],
      async () => {
        if (mode === "replace") {
          await Promise.all([
            this.#database.playbooks.clear(),
            this.#database.concepts.clear(),
            this.#database.formations.clear(),
            this.#database.plays.clear(),
            this.#database.revisions.clear(),
            this.#database.searchProjections.clear(),
          ]);
        }

        await this.#database.playbooks.bulkPut(backup.playbooks);
        await this.#database.concepts.bulkPut(backup.concepts);
        await this.#database.formations.bulkPut(backup.formations);

        const skippedPlays: string[] = [];
        let importedPlays = 0;
        for (const { stored, projection } of plays) {
          const existing = await this.#database.plays.get(stored.id);
          if (existing && existing.updatedAtMs > stored.updatedAtMs) {
            // The Coach edited this Play after the backup was written.
            skippedPlays.push(stored.id);
            continue;
          }
          await this.#database.plays.put(stored);
          if (stored.deletedAtMs === undefined) {
            await this.#database.searchProjections.put(projection);
          } else {
            await this.#database.searchProjections.delete(stored.id);
          }
          importedPlays += 1;
        }

        const skippedRevisions: string[] = [];
        let importedRevisions = 0;
        for (const revision of backup.revisions) {
          // A named version is immutable: an import may add one, never rewrite.
          if (await this.#database.revisions.get(revision.id)) {
            skippedRevisions.push(revision.id);
            continue;
          }
          await this.#database.revisions.add(revision);
          importedRevisions += 1;
        }

        for (const preference of backup.preferences) {
          await this.#database.preferences.put({
            key: preference.key,
            value: preference.value as LocalPreference["value"],
            updatedAtMs: preference.updatedAtMs,
          });
        }

        return {
          playbooks: backup.playbooks.length,
          concepts: backup.concepts.length,
          formations: backup.formations.length,
          plays: importedPlays,
          revisions: importedRevisions,
          preferences: backup.preferences.length,
          skippedPlays: skippedPlays.sort(),
          skippedRevisions: skippedRevisions.sort(),
        };
      },
    );
  }

  /**
   * Rewrites every Play an earlier release left behind so the upgrade happens
   * once rather than on each read. Reads tolerate legacy Plays either way, so
   * a Coach is never blocked on this finishing.
   */
  async upgradeStoredPlays(): Promise<readonly string[]> {
    const stored = await this.#database.plays.toArray();
    const legacy = stored.filter(
      (record) => !playDocumentSchema.safeParse(record.document).success,
    );
    if (legacy.length === 0) return [];

    // Migrating and hashing cannot happen inside a Dexie transaction.
    const upgraded = await Promise.all(
      legacy.map(async (record) => {
        const play = await this.#validatedPlay(record);
        return {
          play,
          projection: projectionFor(
            play.document,
            play.documentHash,
            play.updatedAtMs,
          ),
          previousHash: record.documentHash,
        };
      }),
    );

    return this.#database.transaction(
      "rw",
      [this.#database.plays, this.#database.searchProjections],
      async () => {
        const rewritten: string[] = [];
        for (const { play, projection, previousHash } of upgraded) {
          const existing = await this.#database.plays.get(play.id);
          // Another tab may have upgraded or edited it first.
          if (!existing || existing.documentHash !== previousHash) continue;
          await this.#database.plays.put(play);
          if (play.deletedAtMs === undefined) {
            await this.#database.searchProjections.put(projection);
          }
          rewritten.push(play.id);
        }
        return rewritten.sort();
      },
    );
  }

  /**
   * Records that a session is open and reports whether the previous one ever
   * closed. Committed work is already durable either way; this only decides
   * whether Chalk owes the Coach an explanation.
   */
  async beginSession(sessionId: string): Promise<SessionRecovery> {
    const previous = await this.#database.preferences.get(
      OPEN_SESSION_PREFERENCE,
    );
    const startedAtMs = this.#now();
    await this.#database.preferences.put({
      key: OPEN_SESSION_PREFERENCE,
      value: { sessionId, startedAtMs },
      updatedAtMs: startedAtMs,
    });

    const value = previous?.value;
    const marker =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, JsonValue>)
        : undefined;
    const previousSessionId = marker?.sessionId;
    const previousStartedAtMs = marker?.startedAtMs;
    if (typeof previousSessionId !== "string") {
      return { interrupted: previous !== undefined };
    }
    return {
      interrupted: true,
      previousSessionId,
      ...(typeof previousStartedAtMs === "number"
        ? { previousStartedAtMs }
        : {}),
    };
  }

  async endSession(): Promise<void> {
    await this.#database.preferences.delete(OPEN_SESSION_PREFERENCE);
  }

  /** Without persistent storage a browser may evict a Coach's whole season. */
  async requestPersistentStorage(): Promise<boolean> {
    try {
      if (await this.#storage?.persisted?.()) return true;
      return (await this.#storage?.persist?.()) ?? false;
    } catch {
      return false;
    }
  }

  async storageHealth(): Promise<StorageHealth> {
    let persisted = false;
    let usageBytes: number | undefined;
    let quotaBytes: number | undefined;
    try {
      persisted = (await this.#storage?.persisted?.()) ?? false;
      const estimate = await this.#storage?.estimate?.();
      usageBytes = estimate?.usage;
      quotaBytes = estimate?.quota;
    } catch {
      // An unavailable storage API reports unknown rather than failing startup.
    }
    const usedFraction =
      usageBytes !== undefined && quotaBytes !== undefined && quotaBytes > 0
        ? usageBytes / quotaBytes
        : undefined;

    return {
      persisted,
      pressure: pressureFor(usedFraction),
      ...(usageBytes === undefined ? {} : { usageBytes }),
      ...(quotaBytes === undefined ? {} : { quotaBytes }),
      ...(usedFraction === undefined ? {} : { usedFraction }),
    };
  }

  /**
   * Deleting a Play hides it from the Playbook and its derived data but keeps
   * the document, its versions, and its history recoverable for thirty days.
   */
  async movePlayToTrash(playId: string): Promise<void> {
    const deletedAtMs = this.#now();
    await this.#database.transaction(
      "rw",
      [
        this.#database.plays,
        this.#database.searchProjections,
        this.#database.thumbnails,
      ],
      async () => {
        const existing = await this.#database.plays.get(playId);
        if (!existing) {
          throw new CorruptLocalDataError(
            `Cannot delete Play ${playId} because it is not stored.`,
          );
        }
        if (existing.deletedAtMs !== undefined) return;
        await this.#database.plays.put({ ...existing, deletedAtMs });
        await this.#database.searchProjections.delete(playId);
        await this.#database.thumbnails.where("playId").equals(playId).delete();
      },
    );
  }

  async restorePlayFromTrash(playId: string): Promise<StoredPlay> {
    // Rebuilding the projection needs the document hash, which cannot be
    // computed inside a Dexie transaction.
    const trashed = await this.getPlay(playId);
    if (!trashed) {
      throw new CorruptLocalDataError(
        `Cannot restore Play ${playId} because it is not stored.`,
      );
    }
    const projection = projectionFor(
      trashed.document,
      trashed.documentHash,
      trashed.updatedAtMs,
    );

    await this.#database.transaction(
      "rw",
      [this.#database.plays, this.#database.searchProjections],
      async () => {
        const existing = await this.#database.plays.get(playId);
        if (!existing || existing.documentHash !== trashed.documentHash) {
          throw new StaleLocalPlayError(playId);
        }
        await this.#database.plays.put(withoutTrashMark(existing));
        await this.#database.searchProjections.put(projection);
      },
    );

    return withoutTrashMark(trashed);
  }

  async listTrash(): Promise<readonly TrashedPlaySummary[]> {
    const trashed = await this.#database.plays
      .filter(({ deletedAtMs }) => deletedAtMs !== undefined)
      .toArray();
    return trashed
      .map(({ id, playbookId, document, deletedAtMs }) => ({
        playId: id,
        playbookId,
        name: document.name,
        deletedAtMs: deletedAtMs!,
        purgeAfterMs: deletedAtMs! + TRASH_RETENTION_MS,
      }))
      .sort(
        (left, right) =>
          right.deletedAtMs - left.deletedAtMs ||
          left.playId.localeCompare(right.playId),
      );
  }

  /**
   * Purging is the only path that discards a Coach's Play, its versions, and
   * its history, and it runs only after the retention window has passed.
   */
  async purgeExpiredTrash(): Promise<readonly string[]> {
    const now = this.#now();
    return this.#database.transaction(
      "rw",
      [
        this.#database.plays,
        this.#database.revisions,
        this.#database.undoHistories,
        this.#database.searchProjections,
        this.#database.thumbnails,
      ],
      async () => {
        const expired = await this.#database.plays
          .filter(
            ({ deletedAtMs }) =>
              deletedAtMs !== undefined &&
              deletedAtMs + TRASH_RETENTION_MS <= now,
          )
          .toArray();
        const playIds = expired.map(({ id }) => id).sort();
        for (const playId of playIds) {
          await this.#database.revisions
            .where("playId")
            .equals(playId)
            .delete();
          await this.#database.thumbnails
            .where("playId")
            .equals(playId)
            .delete();
          await this.#database.undoHistories.delete(playId);
          await this.#database.searchProjections.delete(playId);
        }
        await this.#database.plays.bulkDelete(playIds);
        return playIds;
      },
    );
  }

  async readSyncMutationBatch(limit: number): Promise<readonly SyncMutation[]> {
    const batchLimit = positiveLimit(limit);
    const now = this.#now();
    const values = await this.#database.syncMutations.toArray();
    return values
      .filter(({ nextAttemptAtMs }) => nextAttemptAtMs <= now)
      .sort(
        (left, right) =>
          left.createdAtMs - right.createdAtMs ||
          left.id.localeCompare(right.id),
      )
      .slice(0, batchLimit);
  }

  async acknowledgeSyncMutations(ids: readonly string[]): Promise<void> {
    await this.#database.syncMutations.bulkDelete([...ids]);
  }

  async scheduleSyncMutationRetry(
    id: string,
    update: {
      readonly attempts: number;
      readonly nextAttemptAtMs: number;
      readonly status: "pending" | "retry";
    },
  ): Promise<void> {
    const existing = await this.#database.syncMutations.get(id);
    if (!existing) return;
    await this.#database.syncMutations.put({
      ...existing,
      attempts: update.attempts,
      nextAttemptAtMs: update.nextAttemptAtMs,
      status: update.status,
    });
  }

  async enqueueSyncMutation(mutation: SyncMutation): Promise<void> {
    await this.#database.syncMutations.put(structuredClone(mutation));
  }

  async setPlayCloudHead(
    playId: string,
    cloudRevisionId: string,
  ): Promise<void> {
    const existing = await this.#database.plays.get(playId);
    if (!existing) return;
    await this.#database.plays.put({ ...existing, cloudRevisionId });
  }

  async applyRemotePlay(input: {
    readonly play: PlayDocument;
    readonly cloudRevisionId: string;
    readonly revision?: {
      readonly id: string;
      readonly documentHash: string;
      readonly createdAtMs: number;
      readonly parentRevisionId?: string;
    };
  }): Promise<void> {
    const play = playDocumentSchema.parse(input.play);
    const documentHash = await canonicalSha256(play);
    const committedAtMs = this.#now();
    await this.#database.transaction(
      "rw",
      [
        this.#database.plays,
        this.#database.revisions,
        this.#database.searchProjections,
      ],
      async () => {
        const existing = await this.#database.plays.get(play.id);
        const stored: StoredPlay = {
          id: play.id,
          playbookId: play.playbookId,
          document: play,
          documentHash,
          cloudRevisionId: input.cloudRevisionId,
          updatedAtMs: committedAtMs,
          ...(existing?.currentRevisionId
            ? { currentRevisionId: existing.currentRevisionId }
            : {}),
          ...(existing?.deletedAtMs === undefined
            ? {}
            : { deletedAtMs: existing.deletedAtMs }),
        };
        await this.#database.plays.put(stored);
        if (input.revision) {
          await this.#database.revisions.put(
            playRevisionSchema.parse({
              schemaVersion: 1,
              id: input.revision.id,
              playId: play.id,
              createdAtMs: input.revision.createdAtMs,
              documentHash: input.revision.documentHash,
              document: play,
              ...(input.revision.parentRevisionId === undefined
                ? {}
                : { parentRevisionId: input.revision.parentRevisionId }),
            }),
          );
        }
        await this.#database.searchProjections.put(
          projectionFor(play, documentHash, committedAtMs),
        );
      },
    );
  }

  async forkPlay(
    document: PlayDocument,
    newPlayId: string,
  ): Promise<StoredPlay> {
    const forked = playDocumentSchema.parse({
      ...structuredClone(document),
      id: newPlayId,
      name: `${document.name} (branch)`,
    });
    const documentHash = await canonicalSha256(forked);
    const committedAtMs = this.#now();
    const stored: StoredPlay = {
      id: forked.id,
      playbookId: forked.playbookId,
      document: forked,
      documentHash,
      updatedAtMs: committedAtMs,
    };
    await this.#database.transaction(
      "rw",
      [
        this.#database.plays,
        this.#database.syncMutations,
        this.#database.searchProjections,
      ],
      async () => {
        await this.#database.plays.put(stored);
        await this.#database.searchProjections.put(
          projectionFor(forked, documentHash, committedAtMs),
        );
        await this.#database.syncMutations.add({
          id: `mutation_fork_${newPlayId}`,
          entityKind: "play",
          entityId: forked.id,
          operation: "put",
          payloadHash: documentHash,
          payload: forked,
          status: "pending",
          attempts: 0,
          createdAtMs: committedAtMs,
          nextAttemptAtMs: committedAtMs,
        });
      },
    );
    return stored;
  }

  async savePlaybookFromRemote(playbook: Playbook): Promise<void> {
    await this.#database.playbooks.put(
      playbookSchema.parse(structuredClone(playbook)),
    );
  }

  async saveConcept(concept: Concept): Promise<void> {
    await this.#database.concepts.put(
      conceptSchema.parse(structuredClone(concept)),
    );
  }

  async putConflict(conflict: LocalConflict): Promise<void> {
    await this.#database.conflicts.put(structuredClone(conflict));
  }

  async listUnresolvedConflicts(): Promise<readonly LocalConflict[]> {
    const values = await this.#database.conflicts
      .where("status")
      .equals("unresolved")
      .toArray();
    return values.sort(
      (left, right) =>
        left.createdAtMs - right.createdAtMs || left.id.localeCompare(right.id),
    );
  }

  async saveFormation(formation: Formation): Promise<void> {
    await this.#database.formations.put(
      formationSchema.parse(structuredClone(formation)),
    );
  }

  async listFormations(playbookId: string): Promise<readonly Formation[]> {
    const records = await this.#database.formations
      .where("playbookId")
      .equals(playbookId)
      .toArray();
    return records
      .map((value) => formationSchema.parse(value))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async deleteFormation(formationId: string): Promise<void> {
    await this.#database.formations.delete(formationId);
  }

  async setPreference(preference: LocalPreference): Promise<void> {
    await this.#database.preferences.put(structuredClone(preference));
  }

  async getPreference(key: string): Promise<LocalPreference | undefined> {
    return this.#database.preferences.get(key);
  }

  async putImage(image: LocalImageBlob): Promise<void> {
    await this.#database.imageBlobs.put(image);
  }

  async getImage(hash: string): Promise<LocalImageBlob | undefined> {
    return this.#database.imageBlobs.get(hash);
  }

  async putUndoHistory(history: UndoHistory): Promise<void> {
    await this.#database.undoHistories.put(
      structuredClone(undoHistorySchema.parse(history)),
    );
  }

  /**
   * Undo history is disposable: a record that no longer parses is dropped so a
   * migration can cost local history without endangering the Play itself.
   */
  async getUndoHistory(playId: string): Promise<UndoHistory | undefined> {
    const record = await this.#database.undoHistories.get(playId);
    if (!record) return undefined;
    const parsed = undoHistorySchema.safeParse(record);
    if (!parsed.success) {
      await this.#database.undoHistories.delete(playId);
      return undefined;
    }
    return parsed.data;
  }

  async putThumbnail(thumbnail: ThumbnailDerivative): Promise<void> {
    await this.#database.thumbnails.put(thumbnail);
  }

  async getThumbnail(key: string): Promise<ThumbnailDerivative | undefined> {
    return this.#database.thumbnails.get(key);
  }

  async clearDerivedData(): Promise<void> {
    await this.#database.transaction(
      "rw",
      this.#database.searchProjections,
      this.#database.thumbnails,
      async () => {
        await this.#database.searchProjections.clear();
        await this.#database.thumbnails.clear();
      },
    );
  }

  async counts(): Promise<LocalStoreCounts> {
    const [
      playbooks,
      concepts,
      formations,
      plays,
      revisions,
      syncMutations,
      conflicts,
      preferences,
      imageBlobs,
      undoHistories,
      searchProjections,
      thumbnails,
    ] = await Promise.all([
      this.#database.playbooks.count(),
      this.#database.concepts.count(),
      this.#database.formations.count(),
      this.#database.plays.count(),
      this.#database.revisions.count(),
      this.#database.syncMutations.count(),
      this.#database.conflicts.count(),
      this.#database.preferences.count(),
      this.#database.imageBlobs.count(),
      this.#database.undoHistories.count(),
      this.#database.searchProjections.count(),
      this.#database.thumbnails.count(),
    ]);
    return {
      playbooks,
      concepts,
      formations,
      plays,
      revisions,
      syncMutations,
      conflicts,
      preferences,
      imageBlobs,
      undoHistories,
      searchProjections,
      thumbnails,
    };
  }

  /**
   * A Play written by an earlier release is upgraded rather than refused: the
   * Coach's work must survive every schema Chalk has shipped. Its stored hash
   * was computed for the older shape, so the upgraded Play is rehashed instead
   * of being reported as corrupt.
   */
  async #validatedPlay(record: StoredPlay): Promise<StoredPlay> {
    const current = playDocumentSchema.safeParse(record.document);
    if (!current.success) {
      const document = migrateStoredPlayDocument(
        record.document,
        record.playbookId,
      );
      return {
        ...record,
        document,
        documentHash: await canonicalSha256(document),
      };
    }

    const documentHash = await canonicalSha256(current.data);
    if (documentHash !== record.documentHash) {
      throw new CorruptLocalDataError(
        `Stored Play ${record.id} does not match its document hash.`,
      );
    }
    return {
      ...record,
      document: current.data,
      documentHash,
    };
  }
}

export function createDexieLocalRepository(
  options: LocalRepositoryOptions,
): ChalkLocalRepository {
  return new DexieLocalRepository(options);
}
