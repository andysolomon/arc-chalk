import {
  mutationGeneric as mutation,
  type AnyDataModel,
  type GenericMutationCtx,
} from "convex/server";
import { v } from "convex/values";

import {
  confirmAssetUpload,
  coachOwnsAsset,
  type AssetMetadataStore,
  type AssetRecord,
} from "@chalk/contracts";
import { contentHashSchema, storedImageMimeSchema } from "@chalk/domain";

import { requireCoachId } from "./auth";
import { queryTable } from "./indexed";

const mime = v.union(
  v.literal("image/jpeg"),
  v.literal("image/png"),
  v.literal("image/webp"),
);

function assetStore(ctx: GenericMutationCtx<AnyDataModel>): AssetMetadataStore {
  return {
    async getByHash(hash) {
      const row = await queryTable(ctx, "assets")
        .withIndex("by_hash", (q) => q.eq("hash", hash))
        .unique();
      if (!row) return undefined;
      return {
        hash: String(row.hash),
        mimeType: row.mimeType as AssetRecord["mimeType"],
        width: Number(row.width),
        height: Number(row.height),
        byteLength: Number(row.byteLength),
        createdAtMs: Number(row.createdAtMs),
        ownerIds: row.ownerIds as string[],
      };
    },
    async put(record) {
      const existing = await queryTable(ctx, "assets")
        .withIndex("by_hash", (q) => q.eq("hash", record.hash))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id as never, {
          ownerIds: [...record.ownerIds],
        });
        return;
      }
      await ctx.db.insert("assets", {
        hash: record.hash,
        mimeType: record.mimeType,
        width: record.width,
        height: record.height,
        byteLength: record.byteLength,
        createdAtMs: record.createdAtMs,
        ownerIds: [...record.ownerIds],
      });
    },
  };
}

export const prepareUpload = mutation({
  args: {
    hash: v.string(),
    mimeType: mime,
    width: v.number(),
    height: v.number(),
    byteLength: v.number(),
  },
  returns: v.union(
    v.object({ status: v.literal("exists") }),
    v.object({ status: v.literal("upload") }),
  ),
  handler: async (ctx, args) => {
    const coachId = await requireCoachId(ctx);
    contentHashSchema.parse(args.hash);
    storedImageMimeSchema.parse(args.mimeType);
    const store = assetStore(ctx);
    const existing = await store.getByHash(args.hash);
    if (existing) {
      if (!existing.ownerIds.includes(coachId)) {
        await store.put({
          ...existing,
          ownerIds: [...existing.ownerIds, coachId],
        });
      }
      return { status: "exists" as const };
    }
    return { status: "upload" as const };
  },
});

export const confirm = mutation({
  args: {
    hash: v.string(),
    mimeType: mime,
    width: v.number(),
    height: v.number(),
    byteLength: v.number(),
  },
  returns: v.object({ hash: v.string() }),
  handler: async (ctx, args) => {
    const coachId = await requireCoachId(ctx);
    contentHashSchema.parse(args.hash);
    storedImageMimeSchema.parse(args.mimeType);
    const record = await confirmAssetUpload(assetStore(ctx), {
      coachId,
      hash: args.hash,
      mimeType: args.mimeType,
      width: args.width,
      height: args.height,
      byteLength: args.byteLength,
      nowMs: Date.now(),
    });
    return { hash: record.hash };
  },
});

export const getOwned = mutation({
  args: { hash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const coachId = await requireCoachId(ctx);
    const record = await assetStore(ctx).getByHash(args.hash);
    return coachOwnsAsset(record, coachId);
  },
});
