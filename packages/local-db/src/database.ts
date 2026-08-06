import type { Concept, Formation, PlayRevision, Playbook } from "@chalk/domain";
import Dexie, { type Table } from "dexie";

import type {
  LocalConflict,
  LocalImageBlob,
  LocalPreference,
  PlaySearchProjection,
  StoredPlay,
  SyncMutation,
  ThumbnailDerivative,
  UndoHistory,
} from "./types";

export const CHALK_LOCAL_DATABASE_VERSION = 1;

export class ChalkDexieDatabase extends Dexie {
  readonly playbooks!: Table<Playbook, string>;
  readonly concepts!: Table<Concept, string>;
  readonly formations!: Table<Formation, string>;
  readonly plays!: Table<StoredPlay, string>;
  readonly revisions!: Table<PlayRevision, string>;
  readonly syncMutations!: Table<SyncMutation, string>;
  readonly conflicts!: Table<LocalConflict, string>;
  readonly preferences!: Table<LocalPreference, string>;
  readonly imageBlobs!: Table<LocalImageBlob, string>;
  readonly undoHistories!: Table<UndoHistory, string>;
  readonly searchProjections!: Table<PlaySearchProjection, string>;
  readonly thumbnails!: Table<ThumbnailDerivative, string>;

  constructor(
    databaseName: string,
    dependencies?: {
      readonly indexedDB?: IDBFactory;
      readonly IDBKeyRange?: typeof globalThis.IDBKeyRange;
    },
  ) {
    super(databaseName, {
      ...(dependencies?.indexedDB ? { indexedDB: dependencies.indexedDB } : {}),
      ...(dependencies?.IDBKeyRange
        ? { IDBKeyRange: dependencies.IDBKeyRange }
        : {}),
    });

    this.version(CHALK_LOCAL_DATABASE_VERSION).stores({
      playbooks: "&id, updatedAtMs",
      concepts: "&id, playbookId, [playbookId+name]",
      formations: "&id, playbookId, [playbookId+name]",
      plays: "&id, playbookId, updatedAtMs, documentHash, deletedAtMs",
      revisions: "&id, playId, [playId+createdAtMs], documentHash",
      syncMutations:
        "&id, entityId, createdAtMs, status, nextAttemptAtMs, [status+nextAttemptAtMs]",
      conflicts: "&id, playId, status, createdAtMs",
      preferences: "&key, updatedAtMs",
      imageBlobs: "&hash, createdAtMs",
      undoHistories: "&playId, updatedAtMs",
      searchProjections:
        "&playId, playbookId, unit, playTypeId, conceptId, formationId, *tags, updatedAtMs",
      thumbnails: "&key, playId, revisionHash, createdAtMs",
    });
  }
}
