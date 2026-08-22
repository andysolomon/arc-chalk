import { CURRENT_WIRE_SCHEMA_VERSION } from "./limits";

export type EntityKind = "play" | "playbook" | "concept" | "formation";

export type MutationOperation = "put" | "delete";

export type ChangeKind =
  | "playbook"
  | "play_meta"
  | "concept"
  | "formation"
  | "revision"
  | "tombstone"
  | "conflict";

export type PushStatus = "applied" | "duplicate" | "conflict" | "rejected";

export type ConflictResolution = "local" | "remote" | "keep-both" | "combine";

export interface SyncMutationEnvelope {
  readonly idempotencyKey: string;
  readonly entityKind: EntityKind;
  readonly entityId: string;
  readonly operation: MutationOperation;
  readonly baseRevisionId?: string;
  readonly payloadJson?: string;
  readonly payloadHash: string;
  readonly clientCreatedAtMs: number;
  readonly schemaVersion: number;
}

export interface PushBatchRequest {
  readonly mutations: readonly SyncMutationEnvelope[];
  readonly deviceId: string;
  readonly deviceLabel?: string;
}

export type PushMutationOutcome =
  | {
      readonly idempotencyKey: string;
      readonly status: "applied";
      readonly revisionId: string;
      readonly cursor: string;
    }
  | {
      readonly idempotencyKey: string;
      readonly status: "duplicate";
      readonly revisionId?: string;
      readonly cursor?: string;
    }
  | {
      readonly idempotencyKey: string;
      readonly status: "conflict";
      readonly conflictId: string;
      readonly localRevisionId: string;
      readonly remoteRevisionId: string;
      readonly remotePayloadJson?: string;
    }
  | {
      readonly idempotencyKey: string;
      readonly status: "rejected";
      readonly reason: string;
    };

export interface PushBatchResult {
  readonly outcomes: readonly PushMutationOutcome[];
  readonly headCursor: string;
}

export interface SyncChange {
  readonly cursor: string;
  readonly seq: number;
  readonly kind: ChangeKind;
  readonly entityKind: EntityKind;
  readonly entityId: string;
  readonly revisionId?: string;
  readonly documentHash?: string;
  readonly payloadJson?: string;
  readonly playName?: string;
  readonly deviceId?: string;
  readonly deviceLabel?: string;
  readonly createdAtMs: number;
}

export interface PullPage {
  readonly changes: readonly SyncChange[];
  readonly nextCursor: string;
  readonly isDone: boolean;
  readonly headCursor: string;
}

export interface CloudRevision {
  readonly revisionId: string;
  readonly playId: string;
  readonly parentRevisionId?: string;
  readonly documentHash: string;
  readonly payloadJson: string;
  readonly schemaVersion: number;
  readonly createdAtMs: number;
  readonly deviceId: string;
  readonly deviceLabel?: string;
}

export interface ResolveConflictRequest {
  readonly conflictId: string;
  readonly resolution: ConflictResolution;
  readonly chosenRevisionId?: string;
  readonly combinedPayloadJson?: string;
  readonly combinedPayloadHash?: string;
  readonly forkedPlayId?: string;
  readonly deviceId: string;
}

export interface ResolveConflictResult {
  readonly conflictId: string;
  readonly resolution: ConflictResolution;
  readonly headRevisionId?: string;
  readonly cursor: string;
}

export const defaultWireSchemaVersion = CURRENT_WIRE_SCHEMA_VERSION;

export function formatSyncCursor(seq: number): string {
  return seq.toString().padStart(16, "0");
}

export function parseSyncCursor(cursor: string | null): number {
  if (cursor === null || cursor === "") return 0;
  const seq = Number.parseInt(cursor, 10);
  if (!Number.isFinite(seq) || seq < 0) {
    throw new Error("Sync cursor is not a valid sequence.");
  }
  return seq;
}
