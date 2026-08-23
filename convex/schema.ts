import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const entityKind = v.union(
  v.literal("play"),
  v.literal("playbook"),
  v.literal("concept"),
  v.literal("formation"),
);

const changeKind = v.union(
  v.literal("playbook"),
  v.literal("play_meta"),
  v.literal("concept"),
  v.literal("formation"),
  v.literal("revision"),
  v.literal("tombstone"),
  v.literal("conflict"),
);

const shareAccessOutcome = v.union(
  v.literal("granted"),
  v.literal("not-found"),
  v.literal("invalid-secret"),
  v.literal("revoked"),
  v.literal("expired"),
);

export default defineSchema({
  coaches: defineTable({
    coachId: v.string(),
    tokenIdentifier: v.string(),
    clerkSubject: v.string(),
    email: v.optional(v.string()),
    createdAtMs: v.number(),
    lastSeenAtMs: v.number(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_coach", ["coachId"]),

  playbooks: defineTable({
    coachId: v.string(),
    entityId: v.string(),
    payloadJson: v.string(),
    documentHash: v.string(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
  }).index("by_coach_entity", ["coachId", "entityId"]),

  concepts: defineTable({
    coachId: v.string(),
    entityId: v.string(),
    payloadJson: v.string(),
    documentHash: v.string(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
  }).index("by_coach_entity", ["coachId", "entityId"]),

  formations: defineTable({
    coachId: v.string(),
    entityId: v.string(),
    payloadJson: v.string(),
    documentHash: v.string(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
  }).index("by_coach_entity", ["coachId", "entityId"]),

  plays: defineTable({
    coachId: v.string(),
    entityId: v.string(),
    playbookId: v.string(),
    name: v.string(),
    unit: v.string(),
    documentHash: v.string(),
    headRevisionId: v.string(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
  }).index("by_coach_entity", ["coachId", "entityId"]),

  playRevisions: defineTable({
    coachId: v.string(),
    revisionId: v.string(),
    playId: v.string(),
    parentRevisionId: v.optional(v.string()),
    documentHash: v.string(),
    payloadJson: v.string(),
    schemaVersion: v.number(),
    byteLength: v.number(),
    createdAtMs: v.number(),
    deviceId: v.string(),
    deviceLabel: v.optional(v.string()),
  })
    .index("by_revision", ["coachId", "revisionId"])
    .index("by_coach_play", ["coachId", "playId"]),

  mutationReceipts: defineTable({
    coachId: v.string(),
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("applied"),
      v.literal("conflict"),
      v.literal("rejected"),
    ),
    revisionId: v.optional(v.string()),
    conflictId: v.optional(v.string()),
    localRevisionId: v.optional(v.string()),
    remoteRevisionId: v.optional(v.string()),
    remotePayloadJson: v.optional(v.string()),
    reason: v.optional(v.string()),
    createdAtMs: v.number(),
  }).index("by_coach_key", ["coachId", "idempotencyKey"]),

  changes: defineTable({
    coachId: v.string(),
    seq: v.number(),
    cursor: v.string(),
    kind: changeKind,
    entityKind,
    entityId: v.string(),
    revisionId: v.optional(v.string()),
    documentHash: v.optional(v.string()),
    payloadJson: v.optional(v.string()),
    playName: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    deviceLabel: v.optional(v.string()),
    createdAtMs: v.number(),
  }).index("by_coach_seq", ["coachId", "seq"]),

  conflicts: defineTable({
    coachId: v.string(),
    conflictId: v.string(),
    playId: v.string(),
    localRevisionId: v.string(),
    remoteRevisionId: v.string(),
    localPayloadJson: v.string(),
    remotePayloadJson: v.string(),
    playName: v.string(),
    deviceId: v.string(),
    deviceLabel: v.optional(v.string()),
    createdAtMs: v.number(),
    status: v.union(v.literal("unresolved"), v.literal("resolved")),
    resolution: v.optional(
      v.union(
        v.literal("local"),
        v.literal("remote"),
        v.literal("keep-both"),
        v.literal("combine"),
      ),
    ),
    resolvedAtMs: v.optional(v.number()),
  })
    .index("by_conflict", ["coachId", "conflictId"])
    .index("by_coach_play", ["coachId", "playId"]),

  syncHeads: defineTable({
    coachId: v.string(),
    seq: v.number(),
    cursor: v.string(),
    updatedAtMs: v.number(),
  }).index("by_coach", ["coachId"]),

  assets: defineTable({
    hash: v.string(),
    mimeType: v.union(
      v.literal("image/jpeg"),
      v.literal("image/png"),
      v.literal("image/webp"),
    ),
    width: v.number(),
    height: v.number(),
    byteLength: v.number(),
    createdAtMs: v.number(),
    ownerIds: v.array(v.string()),
  }).index("by_hash", ["hash"]),

  sharePublications: defineTable({
    publicationId: v.string(),
    coachId: v.string(),
    title: v.string(),
    publishedAtMs: v.number(),
    documentJson: v.string(),
    documentHash: v.string(),
  })
    .index("by_publicationId", ["publicationId"])
    .index("by_coachId", ["coachId"]),

  shareLinks: defineTable({
    publicId: v.string(),
    coachId: v.string(),
    publicationId: v.string(),
    secretHash: v.string(),
    createdAtMs: v.number(),
    expiresAtMs: v.optional(v.number()),
    revokedAtMs: v.optional(v.number()),
  })
    .index("by_publicId", ["publicId"])
    .index("by_coachId", ["coachId"]),

  shareAccessEvents: defineTable({
    publicId: v.string(),
    atMs: v.number(),
    outcome: shareAccessOutcome,
  }).index("by_publicId", ["publicId"]),
});
