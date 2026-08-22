import {
  mutationGeneric as mutation,
  queryGeneric as query,
  type AnyDataModel,
  type GenericMutationCtx,
} from "convex/server";
import { v } from "convex/values";

import {
  canonicalSha256,
  canonicalStringify,
  createStableId,
  decideShareAccess,
  hashShareSecret,
  contentHashSchema,
  publicationContainsAsset,
  shareAccessEvent,
  sharePublicationSchema,
  shareSecretMatches,
  type ShareLinkState,
  type SharePublication,
} from "@chalk/domain";

import { requireCoachId } from "./auth";
import { queryTable } from "./indexed";

const shareDenial = v.union(
  v.literal("not-found"),
  v.literal("invalid-secret"),
  v.literal("revoked"),
  v.literal("expired"),
);

function pepper(): string {
  const value = process.env.SHARE_TOKEN_PEPPER;
  if (!value || value.length < 32) {
    throw new Error("Share token pepper is not configured.");
  }
  return value;
}

function asLink(doc: Record<string, unknown>): ShareLinkState {
  return {
    publicId: String(doc.publicId),
    coachId: String(doc.coachId),
    publicationId: String(doc.publicationId),
    secretHash: String(doc.secretHash),
    createdAtMs: Number(doc.createdAtMs),
    ...(typeof doc.expiresAtMs === "number"
      ? { expiresAtMs: doc.expiresAtMs }
      : {}),
    ...(typeof doc.revokedAtMs === "number"
      ? { revokedAtMs: doc.revokedAtMs }
      : {}),
  };
}

async function loadLink(
  ctx: GenericMutationCtx<AnyDataModel>,
  publicId: string,
) {
  return queryTable(ctx, "shareLinks")
    .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
    .unique();
}

async function loadPublicationJson(
  ctx: GenericMutationCtx<AnyDataModel>,
  publicationId: string,
): Promise<string | null> {
  const row = await queryTable(ctx, "sharePublications")
    .withIndex("by_publicationId", (q) => q.eq("publicationId", publicationId))
    .unique();
  return row ? String(row.documentJson) : null;
}

const linkSummary = v.object({
  publicId: v.string(),
  publicationId: v.string(),
  title: v.string(),
  createdAtMs: v.number(),
  publishedAtMs: v.number(),
  expiresAtMs: v.optional(v.number()),
  revoked: v.boolean(),
});

export const create = mutation({
  args: {
    publicationJson: v.string(),
    secret: v.string(),
    expiresAtMs: v.optional(v.number()),
  },
  returns: v.object({ publicId: v.string() }),
  handler: async (ctx, args) => {
    const coachId = await requireCoachId(ctx);
    const publication: SharePublication = sharePublicationSchema.parse(
      JSON.parse(args.publicationJson) as unknown,
    );
    const secretHash = await hashShareSecret(args.secret, pepper());
    const publicId = createStableId("share");
    const documentHash = await canonicalSha256(publication);
    await ctx.db.insert("sharePublications", {
      publicationId: publication.id,
      coachId,
      title: publication.title,
      publishedAtMs: publication.publishedAtMs,
      documentJson: canonicalStringify(publication),
      documentHash,
    });
    await ctx.db.insert("shareLinks", {
      publicId,
      coachId,
      publicationId: publication.id,
      secretHash,
      createdAtMs: Date.now(),
      ...(args.expiresAtMs === undefined
        ? {}
        : { expiresAtMs: args.expiresAtMs }),
    });
    return { publicId };
  },
});

export const republish = mutation({
  args: {
    publicId: v.string(),
    publicationJson: v.string(),
  },
  returns: v.object({ publicId: v.string() }),
  handler: async (ctx, args) => {
    const coachId = await requireCoachId(ctx);
    const link = await loadLink(ctx, args.publicId);
    if (!link || link.coachId !== coachId) {
      throw new Error("Share Link not found");
    }
    const publication = sharePublicationSchema.parse(
      JSON.parse(args.publicationJson) as unknown,
    );
    const documentHash = await canonicalSha256(publication);
    await ctx.db.insert("sharePublications", {
      publicationId: publication.id,
      coachId,
      title: publication.title,
      publishedAtMs: publication.publishedAtMs,
      documentJson: canonicalStringify(publication),
      documentHash,
    });
    await ctx.db.patch(link._id as never, { publicationId: publication.id });
    return { publicId: args.publicId };
  },
});

export const revoke = mutation({
  args: { publicId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coachId = await requireCoachId(ctx);
    const link = await loadLink(ctx, args.publicId);
    if (!link || link.coachId !== coachId) {
      throw new Error("Share Link not found");
    }
    await ctx.db.patch(link._id as never, { revokedAtMs: Date.now() });
    return null;
  },
});

export const rotateSecret = mutation({
  args: { publicId: v.string(), secret: v.string() },
  returns: v.object({ publicId: v.string() }),
  handler: async (ctx, args) => {
    const coachId = await requireCoachId(ctx);
    const link = await loadLink(ctx, args.publicId);
    if (!link || link.coachId !== coachId) {
      throw new Error("Share Link not found");
    }
    const secretHash = await hashShareSecret(args.secret, pepper());
    await ctx.db.patch(link._id as never, { secretHash });
    return { publicId: args.publicId };
  },
});

export const setExpiry = mutation({
  args: {
    publicId: v.string(),
    expiresAtMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const coachId = await requireCoachId(ctx);
    const link = await loadLink(ctx, args.publicId);
    if (!link || link.coachId !== coachId) {
      throw new Error("Share Link not found");
    }
    await ctx.db.patch(link._id as never, {
      expiresAtMs: args.expiresAtMs,
    });
    return null;
  },
});

export const list = query({
  args: {},
  returns: v.array(linkSummary),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const tokenIdentifier = identity.tokenIdentifier || identity.subject;
    if (!tokenIdentifier) return [];
    const coach = await queryTable(ctx, "coaches")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", tokenIdentifier),
      )
      .unique();
    if (!coach) return [];
    const links = await queryTable(ctx, "shareLinks")
      .withIndex("by_coachId", (q) => q.eq("coachId", coach.coachId))
      .collect();
    const summaries = [];
    for (const link of links) {
      const publication = await queryTable(ctx, "sharePublications")
        .withIndex("by_publicationId", (q) =>
          q.eq("publicationId", link.publicationId),
        )
        .unique();
      summaries.push({
        publicId: String(link.publicId),
        publicationId: String(link.publicationId),
        title: publication ? String(publication.title) : "Share Link",
        createdAtMs: Number(link.createdAtMs),
        publishedAtMs: publication
          ? Number(publication.publishedAtMs)
          : Number(link.createdAtMs),
        ...(typeof link.expiresAtMs === "number"
          ? { expiresAtMs: link.expiresAtMs }
          : {}),
        revoked: typeof link.revokedAtMs === "number",
      });
    }
    return summaries;
  },
});

export const open = mutation({
  args: {
    publicId: v.string(),
    secret: v.string(),
  },
  returns: v.union(
    v.object({
      outcome: v.literal("granted"),
      publicationJson: v.string(),
    }),
    v.object({ outcome: shareDenial }),
  ),
  handler: async (ctx, args) => {
    const row = await loadLink(ctx, args.publicId);
    const record = row ? asLink(row) : undefined;
    const secretMatches = record
      ? await shareSecretMatches(args.secret, record.secretHash, pepper())
      : false;
    const nowMs = Date.now();
    const outcome = decideShareAccess(record, secretMatches, nowMs);
    await ctx.db.insert("shareAccessEvents", {
      ...shareAccessEvent(args.publicId, outcome, nowMs),
    });
    if (outcome !== "granted") return { outcome };
    if (!record) return { outcome: "not-found" as const };
    const publicationJson = await loadPublicationJson(
      ctx,
      record.publicationId,
    );
    if (!publicationJson) return { outcome: "not-found" as const };
    sharePublicationSchema.parse(JSON.parse(publicationJson) as unknown);
    return { outcome: "granted" as const, publicationJson };
  },
});

export const authorizeAsset = mutation({
  args: {
    publicId: v.string(),
    secret: v.string(),
    hash: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    contentHashSchema.parse(args.hash);
    const row = await loadLink(ctx, args.publicId);
    const record = row ? asLink(row) : undefined;
    const secretMatches = record
      ? await shareSecretMatches(args.secret, record.secretHash, pepper())
      : false;
    const outcome = decideShareAccess(record, secretMatches, Date.now());
    if (outcome !== "granted" || !record) return false;
    const publicationJson = await loadPublicationJson(
      ctx,
      record.publicationId,
    );
    if (!publicationJson) return false;
    const publication = sharePublicationSchema.parse(
      JSON.parse(publicationJson) as unknown,
    );
    return publicationContainsAsset(publication, args.hash);
  },
});
