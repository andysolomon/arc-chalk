import { v } from "convex/values";

import {
  applyPullAfter,
  applyPushBatch,
  applyResolveConflict,
  readRevision,
} from "@chalk/sync";
import { mutation, query } from "./_generated/server";
import { getCurrentCoach } from "./lib/auth";
import { convexReplicaStore } from "./lib/store";

const entityKind = v.union(
  v.literal("play"),
  v.literal("playbook"),
  v.literal("concept"),
  v.literal("formation"),
);

const mutationEnvelope = v.object({
  idempotencyKey: v.string(),
  entityKind,
  entityId: v.string(),
  operation: v.union(v.literal("put"), v.literal("delete")),
  baseRevisionId: v.optional(v.string()),
  payloadJson: v.optional(v.string()),
  payloadHash: v.string(),
  clientCreatedAtMs: v.number(),
  schemaVersion: v.number(),
});

const pushOutcome = v.union(
  v.object({
    idempotencyKey: v.string(),
    status: v.literal("applied"),
    revisionId: v.string(),
    cursor: v.string(),
  }),
  v.object({
    idempotencyKey: v.string(),
    status: v.literal("duplicate"),
    revisionId: v.optional(v.string()),
    cursor: v.optional(v.string()),
  }),
  v.object({
    idempotencyKey: v.string(),
    status: v.literal("conflict"),
    conflictId: v.string(),
    localRevisionId: v.string(),
    remoteRevisionId: v.string(),
    remotePayloadJson: v.optional(v.string()),
  }),
  v.object({
    idempotencyKey: v.string(),
    status: v.literal("rejected"),
    reason: v.string(),
  }),
);

const change = v.object({
  cursor: v.string(),
  seq: v.number(),
  kind: v.union(
    v.literal("playbook"),
    v.literal("play_meta"),
    v.literal("concept"),
    v.literal("formation"),
    v.literal("revision"),
    v.literal("tombstone"),
    v.literal("conflict"),
  ),
  entityKind,
  entityId: v.string(),
  revisionId: v.optional(v.string()),
  documentHash: v.optional(v.string()),
  payloadJson: v.optional(v.string()),
  playName: v.optional(v.string()),
  deviceId: v.optional(v.string()),
  deviceLabel: v.optional(v.string()),
  createdAtMs: v.number(),
});

export const pushBatch = mutation({
  args: {
    mutations: v.array(mutationEnvelope),
    deviceId: v.string(),
    deviceLabel: v.optional(v.string()),
  },
  returns: v.object({
    outcomes: v.array(pushOutcome),
    headCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const coach = await getCurrentCoach(ctx);
    const result = await applyPushBatch(
      convexReplicaStore(ctx, coach.coachId),
      coach.coachId,
      args,
      Date.now(),
    );
    return {
      outcomes: [...result.outcomes],
      headCursor: result.headCursor,
    };
  },
});

export const pullAfter = query({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  returns: v.object({
    changes: v.array(change),
    nextCursor: v.string(),
    isDone: v.boolean(),
    headCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const coach = await getCurrentCoach(ctx);
    const page = await applyPullAfter(
      convexReplicaStore(ctx, coach.coachId),
      coach.coachId,
      args.cursor,
      args.limit,
    );
    return {
      changes: [...page.changes],
      nextCursor: page.nextCursor,
      isDone: page.isDone,
      headCursor: page.headCursor,
    };
  },
});

export const head = query({
  args: {},
  returns: v.object({
    cursor: v.string(),
    seq: v.number(),
  }),
  handler: async (ctx) => {
    const coach = await getCurrentCoach(ctx);
    return await convexReplicaStore(ctx, coach.coachId).getHead(coach.coachId);
  },
});

export const getRevision = query({
  args: { revisionId: v.string() },
  returns: v.union(
    v.object({
      revisionId: v.string(),
      playId: v.string(),
      parentRevisionId: v.optional(v.string()),
      documentHash: v.string(),
      payloadJson: v.string(),
      schemaVersion: v.number(),
      createdAtMs: v.number(),
      deviceId: v.string(),
      deviceLabel: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const coach = await getCurrentCoach(ctx);
    return await readRevision(
      convexReplicaStore(ctx, coach.coachId),
      coach.coachId,
      args.revisionId,
    );
  },
});

export const resolveConflict = mutation({
  args: {
    conflictId: v.string(),
    resolution: v.union(
      v.literal("local"),
      v.literal("remote"),
      v.literal("keep-both"),
      v.literal("combine"),
    ),
    chosenRevisionId: v.optional(v.string()),
    combinedPayloadJson: v.optional(v.string()),
    combinedPayloadHash: v.optional(v.string()),
    forkedPlayId: v.optional(v.string()),
    deviceId: v.string(),
  },
  returns: v.object({
    conflictId: v.string(),
    resolution: v.union(
      v.literal("local"),
      v.literal("remote"),
      v.literal("keep-both"),
      v.literal("combine"),
    ),
    headRevisionId: v.optional(v.string()),
    cursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const coach = await getCurrentCoach(ctx);
    return await applyResolveConflict(
      convexReplicaStore(ctx, coach.coachId),
      coach.coachId,
      args,
      Date.now(),
    );
  },
});
