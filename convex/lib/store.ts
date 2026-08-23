import {
  formatSyncCursor,
  type CloudRevision,
  type EntityKind,
  type SyncChange,
} from "@chalk/contracts";
import type {
  CloudConflictRecord,
  CloudEntityRecord,
  CloudPlayHead,
  MutationReceipt,
  ReplicaStore,
} from "@chalk/sync";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

function isMutation(ctx: Ctx): ctx is MutationCtx {
  return "insert" in ctx.db;
}

export function convexReplicaStore(ctx: Ctx, coachId: string): ReplicaStore {
  return {
    async getReceipt(_coachId, idempotencyKey) {
      return (
        (await ctx.db
          .query("mutationReceipts")
          .withIndex("by_coach_key", (q) =>
            q.eq("coachId", coachId).eq("idempotencyKey", idempotencyKey),
          )
          .unique()) ?? null
      );
    },

    async putReceipt(receipt) {
      if (!isMutation(ctx))
        throw new Error("Receipts cannot be written in a query.");
      const existing = await ctx.db
        .query("mutationReceipts")
        .withIndex("by_coach_key", (q) =>
          q.eq("coachId", coachId).eq("idempotencyKey", receipt.idempotencyKey),
        )
        .unique();
      const fields: MutationReceipt = receipt;
      if (existing) {
        await ctx.db.replace(existing._id, {
          ...fields,
          coachId,
        });
        return;
      }
      await ctx.db.insert("mutationReceipts", { ...fields, coachId });
    },

    async getPlay(_coachId, playId) {
      const row = await ctx.db
        .query("plays")
        .withIndex("by_coach_entity", (q) =>
          q.eq("coachId", coachId).eq("entityId", playId),
        )
        .unique();
      return row ? toPlayHead(row) : null;
    },

    async putPlay(_coachId, play) {
      if (!isMutation(ctx))
        throw new Error("Plays cannot be written in a query.");
      const existing = await ctx.db
        .query("plays")
        .withIndex("by_coach_entity", (q) =>
          q.eq("coachId", coachId).eq("entityId", play.entityId),
        )
        .unique();
      const fields = {
        coachId,
        entityId: play.entityId,
        playbookId: play.playbookId,
        name: play.name,
        unit: play.unit,
        documentHash: play.documentHash,
        headRevisionId: play.headRevisionId,
        updatedAtMs: play.updatedAtMs,
        ...(play.deletedAtMs === undefined
          ? {}
          : { deletedAtMs: play.deletedAtMs }),
      };
      if (existing) await ctx.db.replace(existing._id, fields);
      else await ctx.db.insert("plays", fields);
    },

    async getEntity(_coachId, kind, entityId) {
      const table = tableFor(kind);
      const row = await ctx.db
        .query(table)
        .withIndex("by_coach_entity", (q) =>
          q.eq("coachId", coachId).eq("entityId", entityId),
        )
        .unique();
      return row ? toEntity(row) : null;
    },

    async putEntity(_coachId, kind, record) {
      if (!isMutation(ctx))
        throw new Error("Entities cannot be written in a query.");
      const table = tableFor(kind);
      const existing = await ctx.db
        .query(table)
        .withIndex("by_coach_entity", (q) =>
          q.eq("coachId", coachId).eq("entityId", record.entityId),
        )
        .unique();
      const fields = {
        coachId,
        entityId: record.entityId,
        payloadJson: record.payloadJson,
        documentHash: record.documentHash,
        updatedAtMs: record.updatedAtMs,
        ...(record.deletedAtMs === undefined
          ? {}
          : { deletedAtMs: record.deletedAtMs }),
      };
      if (existing) await ctx.db.replace(existing._id, fields);
      else await ctx.db.insert(table, fields);
    },

    async getRevision(_coachId, revisionId) {
      const row = await ctx.db
        .query("playRevisions")
        .withIndex("by_revision", (q) =>
          q.eq("coachId", coachId).eq("revisionId", revisionId),
        )
        .unique();
      return row ? toRevision(row) : null;
    },

    async putRevision(_coachId, revision) {
      if (!isMutation(ctx))
        throw new Error("Revisions cannot be written in a query.");
      const existing = await ctx.db
        .query("playRevisions")
        .withIndex("by_revision", (q) =>
          q.eq("coachId", coachId).eq("revisionId", revision.revisionId),
        )
        .unique();
      const fields = {
        coachId,
        revisionId: revision.revisionId,
        playId: revision.playId,
        documentHash: revision.documentHash,
        payloadJson: revision.payloadJson,
        schemaVersion: revision.schemaVersion,
        byteLength: new TextEncoder().encode(revision.payloadJson).byteLength,
        createdAtMs: revision.createdAtMs,
        deviceId: revision.deviceId,
        ...(revision.parentRevisionId === undefined
          ? {}
          : { parentRevisionId: revision.parentRevisionId }),
        ...(revision.deviceLabel === undefined
          ? {}
          : { deviceLabel: revision.deviceLabel }),
      };
      if (existing) await ctx.db.replace(existing._id, fields);
      else await ctx.db.insert("playRevisions", fields);
    },

    async getConflict(_coachId, conflictId) {
      const row = await ctx.db
        .query("conflicts")
        .withIndex("by_conflict", (q) =>
          q.eq("coachId", coachId).eq("conflictId", conflictId),
        )
        .unique();
      return row ? toConflict(row) : null;
    },

    async putConflict(_coachId, conflict) {
      if (!isMutation(ctx))
        throw new Error("Conflicts cannot be written in a query.");
      const existing = await ctx.db
        .query("conflicts")
        .withIndex("by_conflict", (q) =>
          q.eq("coachId", coachId).eq("conflictId", conflict.conflictId),
        )
        .unique();
      const fields = {
        coachId,
        ...conflict,
      };
      if (existing) await ctx.db.replace(existing._id, fields);
      else await ctx.db.insert("conflicts", fields);
    },

    async advanceHead(_coachId, nowMs) {
      if (!isMutation(ctx))
        throw new Error("The sync head cannot advance in a query.");
      const existing = await ctx.db
        .query("syncHeads")
        .withIndex("by_coach", (q) => q.eq("coachId", coachId))
        .unique();
      const seq = (existing?.seq ?? 0) + 1;
      const cursor = formatSyncCursor(seq);
      if (existing) {
        await ctx.db.patch(existing._id, { seq, cursor, updatedAtMs: nowMs });
      } else {
        await ctx.db.insert("syncHeads", {
          coachId,
          seq,
          cursor,
          updatedAtMs: nowMs,
        });
      }
      return { seq, cursor };
    },

    async getHead() {
      const existing = await ctx.db
        .query("syncHeads")
        .withIndex("by_coach", (q) => q.eq("coachId", coachId))
        .unique();
      return existing
        ? { seq: existing.seq, cursor: existing.cursor }
        : { seq: 0, cursor: formatSyncCursor(0) };
    },

    async appendChange(_coachId, change) {
      if (!isMutation(ctx))
        throw new Error("Changes cannot be written in a query.");
      await ctx.db.insert("changes", {
        coachId,
        ...change,
      });
    },

    async listChangesAfter(_coachId, afterSeq, limit) {
      const rows = await ctx.db
        .query("changes")
        .withIndex("by_coach_seq", (q) =>
          q.eq("coachId", coachId).gt("seq", afterSeq),
        )
        .take(limit);
      return rows.map(toChange);
    },
  };
}

function tableFor(
  kind: Exclude<EntityKind, "play">,
): "playbooks" | "concepts" | "formations" {
  if (kind === "playbook") return "playbooks";
  if (kind === "concept") return "concepts";
  return "formations";
}

function toPlayHead(row: {
  entityId: string;
  playbookId: string;
  name: string;
  unit: string;
  documentHash: string;
  headRevisionId: string;
  updatedAtMs: number;
  deletedAtMs?: number;
}): CloudPlayHead {
  return {
    entityId: row.entityId,
    playbookId: row.playbookId,
    name: row.name,
    unit: row.unit,
    documentHash: row.documentHash,
    headRevisionId: row.headRevisionId,
    updatedAtMs: row.updatedAtMs,
    ...(row.deletedAtMs === undefined ? {} : { deletedAtMs: row.deletedAtMs }),
  };
}

function toEntity(row: {
  entityId: string;
  documentHash: string;
  payloadJson: string;
  updatedAtMs: number;
  deletedAtMs?: number;
}): CloudEntityRecord {
  return {
    entityId: row.entityId,
    documentHash: row.documentHash,
    payloadJson: row.payloadJson,
    updatedAtMs: row.updatedAtMs,
    ...(row.deletedAtMs === undefined ? {} : { deletedAtMs: row.deletedAtMs }),
  };
}

function toRevision(
  row: CloudRevision & { deviceLabel?: string },
): CloudRevision {
  return {
    revisionId: row.revisionId,
    playId: row.playId,
    documentHash: row.documentHash,
    payloadJson: row.payloadJson,
    schemaVersion: row.schemaVersion,
    createdAtMs: row.createdAtMs,
    deviceId: row.deviceId,
    ...(row.parentRevisionId === undefined
      ? {}
      : { parentRevisionId: row.parentRevisionId }),
    ...(row.deviceLabel === undefined ? {} : { deviceLabel: row.deviceLabel }),
  };
}

function toConflict(row: CloudConflictRecord): CloudConflictRecord {
  return {
    conflictId: row.conflictId,
    playId: row.playId,
    localRevisionId: row.localRevisionId,
    remoteRevisionId: row.remoteRevisionId,
    localPayloadJson: row.localPayloadJson,
    remotePayloadJson: row.remotePayloadJson,
    playName: row.playName,
    deviceId: row.deviceId,
    createdAtMs: row.createdAtMs,
    status: row.status,
    ...(row.deviceLabel === undefined ? {} : { deviceLabel: row.deviceLabel }),
    ...(row.resolution === undefined ? {} : { resolution: row.resolution }),
    ...(row.resolvedAtMs === undefined
      ? {}
      : { resolvedAtMs: row.resolvedAtMs }),
  };
}

function toChange(row: SyncChange): SyncChange {
  return {
    cursor: row.cursor,
    seq: row.seq,
    kind: row.kind,
    entityKind: row.entityKind,
    entityId: row.entityId,
    createdAtMs: row.createdAtMs,
    ...(row.revisionId === undefined ? {} : { revisionId: row.revisionId }),
    ...(row.documentHash === undefined
      ? {}
      : { documentHash: row.documentHash }),
    ...(row.payloadJson === undefined ? {} : { payloadJson: row.payloadJson }),
    ...(row.playName === undefined ? {} : { playName: row.playName }),
    ...(row.deviceId === undefined ? {} : { deviceId: row.deviceId }),
    ...(row.deviceLabel === undefined ? {} : { deviceLabel: row.deviceLabel }),
  };
}
