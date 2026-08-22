import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export async function getCurrentCoach(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"coaches">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const coach = await ctx.db
    .query("coaches")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (!coach) {
    throw new Error("Coach not found");
  }

  return coach;
}

export async function getCurrentCoachOrNull(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"coaches"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("coaches")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}
