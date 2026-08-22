import {
  mutationGeneric as mutation,
  queryGeneric as query,
  type AnyDataModel,
  type GenericMutationCtx,
  type GenericQueryCtx,
} from "convex/server";
import { v } from "convex/values";

import { createStableId } from "@chalk/domain";

import { queryTable } from "./indexed";

type QueryCtx = GenericQueryCtx<AnyDataModel>;
type MutationCtx = GenericMutationCtx<AnyDataModel>;

export async function requireIdentity(
  ctx: Pick<QueryCtx, "auth">,
): Promise<{ tokenIdentifier: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const tokenIdentifier = identity.tokenIdentifier || identity.subject;
  if (!tokenIdentifier) throw new Error("Not authenticated");
  return { tokenIdentifier };
}

export async function requireCoachId(ctx: MutationCtx): Promise<string> {
  const { tokenIdentifier } = await requireIdentity(ctx);
  const existing = await queryTable(ctx, "coaches")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", tokenIdentifier),
    )
    .unique();
  if (existing) return existing.coachId as string;
  const coachId = createStableId("coach");
  await ctx.db.insert("coaches", {
    tokenIdentifier,
    coachId,
    createdAtMs: Date.now(),
  });
  return coachId;
}

export const ensureCoach = mutation({
  args: {},
  returns: v.object({ coachId: v.string() }),
  handler: async (ctx) => ({ coachId: await requireCoachId(ctx) }),
});

export const whoami = query({
  args: {},
  returns: v.union(v.object({ coachId: v.string() }), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const tokenIdentifier = identity.tokenIdentifier || identity.subject;
    if (!tokenIdentifier) return null;
    const existing = await queryTable(ctx, "coaches")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", tokenIdentifier),
      )
      .unique();
    return existing ? { coachId: existing.coachId as string } : null;
  },
});
