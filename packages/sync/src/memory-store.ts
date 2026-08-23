/* eslint-disable @typescript-eslint/require-await */
import { formatSyncCursor, type SyncChange } from "@chalk/contracts";
import type { CloudRevision, EntityKind } from "@chalk/contracts";

import type {
  CloudConflictRecord,
  CloudEntityRecord,
  CloudPlayHead,
  MutationReceipt,
  ReplicaStore,
} from "./engine";

function key(coachId: string, id: string): string {
  return `${coachId}:${id}`;
}

function entityKey(
  coachId: string,
  kind: Exclude<EntityKind, "play">,
  entityId: string,
): string {
  return `${coachId}:${kind}:${entityId}`;
}

/**
 * In-memory replica used by unit tests and two-device convergence cases.
 * It is the same protocol engine Convex runs, against Maps instead of tables.
 */
export class MemoryReplicaStore implements ReplicaStore {
  readonly receipts = new Map<string, MutationReceipt>();
  readonly plays = new Map<string, CloudPlayHead>();
  readonly entities = new Map<string, CloudEntityRecord>();
  readonly revisions = new Map<string, CloudRevision>();
  readonly conflicts = new Map<string, CloudConflictRecord>();
  readonly changes = new Map<string, SyncChange[]>();
  readonly heads = new Map<string, { seq: number; cursor: string }>();

  async getReceipt(
    coachId: string,
    idempotencyKey: string,
  ): Promise<MutationReceipt | null> {
    return this.receipts.get(key(coachId, idempotencyKey)) ?? null;
  }

  async putReceipt(receipt: MutationReceipt): Promise<void> {
    this.receipts.set(key(receipt.coachId, receipt.idempotencyKey), receipt);
  }

  async getPlay(
    coachId: string,
    playId: string,
  ): Promise<CloudPlayHead | null> {
    return this.plays.get(key(coachId, playId)) ?? null;
  }

  async putPlay(coachId: string, play: CloudPlayHead): Promise<void> {
    this.plays.set(key(coachId, play.entityId), play);
  }

  async getEntity(
    coachId: string,
    kind: Exclude<EntityKind, "play">,
    entityId: string,
  ): Promise<CloudEntityRecord | null> {
    return this.entities.get(entityKey(coachId, kind, entityId)) ?? null;
  }

  async putEntity(
    coachId: string,
    kind: Exclude<EntityKind, "play">,
    record: CloudEntityRecord,
  ): Promise<void> {
    this.entities.set(entityKey(coachId, kind, record.entityId), record);
  }

  async getRevision(
    coachId: string,
    revisionId: string,
  ): Promise<CloudRevision | null> {
    return this.revisions.get(key(coachId, revisionId)) ?? null;
  }

  async putRevision(coachId: string, revision: CloudRevision): Promise<void> {
    this.revisions.set(key(coachId, revision.revisionId), revision);
  }

  async getConflict(
    coachId: string,
    conflictId: string,
  ): Promise<CloudConflictRecord | null> {
    return this.conflicts.get(key(coachId, conflictId)) ?? null;
  }

  async putConflict(
    coachId: string,
    conflict: CloudConflictRecord,
  ): Promise<void> {
    this.conflicts.set(key(coachId, conflict.conflictId), conflict);
  }

  async advanceHead(
    coachId: string,
    nowMs: number,
  ): Promise<{ seq: number; cursor: string }> {
    void nowMs;
    const current = this.heads.get(coachId) ?? {
      seq: 0,
      cursor: formatSyncCursor(0),
    };
    const seq = current.seq + 1;
    const next = { seq, cursor: formatSyncCursor(seq) };
    this.heads.set(coachId, next);
    return next;
  }

  async getHead(coachId: string): Promise<{ seq: number; cursor: string }> {
    return this.heads.get(coachId) ?? { seq: 0, cursor: formatSyncCursor(0) };
  }

  async appendChange(coachId: string, change: SyncChange): Promise<void> {
    const list = this.changes.get(coachId) ?? [];
    list.push(change);
    this.changes.set(coachId, list);
  }

  async listChangesAfter(
    coachId: string,
    afterSeq: number,
    limit: number,
  ): Promise<readonly SyncChange[]> {
    return (this.changes.get(coachId) ?? [])
      .filter((change) => change.seq > afterSeq)
      .slice(0, limit);
  }
}
