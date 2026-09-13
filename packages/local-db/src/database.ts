import type {
  Concept,
  Formation,
  GamePlan,
  GamePlanRevision,
  PlayRevision,
  Playbook,
} from "@chalk/domain";
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

export const CHALK_LOCAL_DATABASE_VERSION = 2;

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
  readonly gamePlans!: Table<GamePlan, string>;
  readonly gamePlanRevisions!: Table<GamePlanRevision, string>;

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

    // Version 1 is what the first release wrote; it stays declared so a
    // device on it upgrades in place rather than starting over.
    this.version(1).stores({
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
    // Version 2 adds Game Plans and their prepared revisions (ADR 0042).
    // Only the new stores are declared; Dexie carries the rest forward.
    this.version(CHALK_LOCAL_DATABASE_VERSION).stores({
      gamePlans: "&id, playbookId, updatedAtMs",
      gamePlanRevisions: "&id, planId, playbookId, createdAtMs",
    });
  }
}
