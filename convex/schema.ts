import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const shareAccessOutcome = v.union(
  v.literal("granted"),
  v.literal("not-found"),
  v.literal("invalid-secret"),
  v.literal("revoked"),
  v.literal("expired"),
);

export default defineSchema({
  coaches: defineTable({
    tokenIdentifier: v.string(),
    coachId: v.string(),
    createdAtMs: v.number(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),

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
