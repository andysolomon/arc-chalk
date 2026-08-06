import type {
  Concept,
  Formation,
  PlayDocument,
  PlayRevision,
  PlayUnit,
  Playbook,
  PlaybookEnvelope,
  UndoHistory,
} from "@chalk/domain";

export type { UndoEntry, UndoHistory } from "@chalk/domain";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface StoredPlay {
  readonly id: string;
  readonly playbookId: string;
  readonly document: PlayDocument;
  readonly documentHash: string;
  readonly currentRevisionId?: string;
  readonly updatedAtMs: number;
  readonly deletedAtMs?: number;
}

export interface SyncMutation {
  readonly id: string;
  readonly entityKind: "play" | "playbook" | "concept" | "formation";
  readonly entityId: string;
  readonly operation: "put" | "delete";
  readonly baseRevisionId?: string;
  readonly payloadHash: string;
  readonly payload: PlayDocument | Playbook | Concept | Formation;
  readonly status: "pending" | "retry";
  readonly attempts: number;
  readonly createdAtMs: number;
  readonly nextAttemptAtMs: number;
}

export interface LocalConflict {
  readonly id: string;
  readonly playId: string;
  readonly localRevisionId: string;
  readonly remoteRevisionId: string;
  readonly status: "unresolved" | "resolved";
  readonly createdAtMs: number;
  readonly resolvedAtMs?: number;
}

/** Metadata for one point in a Play's history, without its whole document. */
export interface PlayVersionSummary {
  readonly id: string;
  readonly playId: string;
  readonly label?: string;
  readonly createdAtMs: number;
  readonly documentHash: string;
  readonly parentRevisionId?: string;
}

/** A Play stays recoverable in the Trash for thirty days before it is purged. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface TrashedPlaySummary {
  readonly playId: string;
  readonly playbookId: string;
  readonly name: string;
  readonly deletedAtMs: number;
  readonly purgeAfterMs: number;
}

export interface CreateNamedVersionInput {
  readonly playId: string;
  readonly revisionId: string;
  readonly label: string;
}

export interface LocalPreference {
  readonly key: string;
  readonly value: JsonValue;
  readonly updatedAtMs: number;
}

export interface LocalImageBlob {
  readonly hash: string;
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly blob: Blob;
  readonly thumbnail: Blob;
  readonly createdAtMs: number;
}

export interface PlaySearchProjection {
  readonly playId: string;
  readonly playbookId: string;
  readonly name: string;
  readonly unit: PlayUnit;
  readonly playTypeId?: string;
  readonly playTypeName?: string;
  readonly conceptId?: string;
  readonly formationId?: string;
  readonly personnelLabel?: string;
  readonly tags: readonly string[];
  readonly playerRoles: readonly string[];
  readonly assignmentText: readonly string[];
  readonly notes: string;
  readonly documentHash: string;
  readonly updatedAtMs: number;
}

export interface ThumbnailDerivative {
  readonly key: string;
  readonly playId: string;
  readonly revisionHash: string;
  readonly rendererVersion: number;
  readonly fieldProfileRevision: number;
  readonly theme: "light" | "dark" | "high-contrast";
  readonly blob: Blob;
  readonly createdAtMs: number;
}

export interface LocalStoreCounts {
  readonly playbooks: number;
  readonly concepts: number;
  readonly formations: number;
  readonly plays: number;
  readonly revisions: number;
  readonly syncMutations: number;
  readonly conflicts: number;
  readonly preferences: number;
  readonly imageBlobs: number;
  readonly undoHistories: number;
  readonly searchProjections: number;
  readonly thumbnails: number;
}

export interface CommitPlayInput {
  readonly play: PlayDocument;
  readonly expectedDocumentHash?: string;
  readonly revision?: {
    readonly id: string;
    readonly label?: string;
  };
  readonly mutation?: {
    readonly id: string;
    readonly baseRevisionId?: string;
  };
  /** Written in the commit transaction so history never outruns the Play. */
  readonly undoHistory?: UndoHistory;
}

export interface CommitPlayResult {
  readonly playId: string;
  readonly documentHash: string;
  readonly committedAtMs: number;
  readonly revisionId?: string;
  readonly mutationId?: string;
  readonly undoEntryCount?: number;
}

export interface LocalRepositoryOptions {
  readonly databaseName: string;
  readonly indexedDB?: IDBFactory;
  readonly IDBKeyRange?: typeof globalThis.IDBKeyRange;
  readonly now?: () => number;
}

export interface ChalkLocalRepository {
  open(): Promise<void>;
  close(): void;
  destroy(): Promise<void>;

  savePlaybook(envelope: PlaybookEnvelope): Promise<void>;
  loadPlaybook(playbookId: string): Promise<PlaybookEnvelope | undefined>;
  getPlay(playId: string): Promise<StoredPlay | undefined>;
  listPlaySummaries(
    playbookId: string,
  ): Promise<readonly PlaySearchProjection[]>;
  commitPlay(input: CommitPlayInput): Promise<CommitPlayResult>;
  getRevision(revisionId: string): Promise<PlayRevision | undefined>;
  createNamedVersion(input: CreateNamedVersionInput): Promise<PlayRevision>;
  listPlayVersions(playId: string): Promise<readonly PlayVersionSummary[]>;

  movePlayToTrash(playId: string): Promise<void>;
  restorePlayFromTrash(playId: string): Promise<StoredPlay>;
  listTrash(): Promise<readonly TrashedPlaySummary[]>;
  purgeExpiredTrash(): Promise<readonly string[]>;

  readSyncMutationBatch(limit: number): Promise<readonly SyncMutation[]>;
  acknowledgeSyncMutations(ids: readonly string[]): Promise<void>;
  putConflict(conflict: LocalConflict): Promise<void>;
  listUnresolvedConflicts(): Promise<readonly LocalConflict[]>;

  setPreference(preference: LocalPreference): Promise<void>;
  getPreference(key: string): Promise<LocalPreference | undefined>;
  putImage(image: LocalImageBlob): Promise<void>;
  getImage(hash: string): Promise<LocalImageBlob | undefined>;
  putUndoHistory(history: UndoHistory): Promise<void>;
  getUndoHistory(playId: string): Promise<UndoHistory | undefined>;

  putThumbnail(thumbnail: ThumbnailDerivative): Promise<void>;
  getThumbnail(key: string): Promise<ThumbnailDerivative | undefined>;
  clearDerivedData(): Promise<void>;
  counts(): Promise<LocalStoreCounts>;
}
