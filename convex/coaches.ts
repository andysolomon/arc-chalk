import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getCurrentCoach } from "./lib/auth";

const coachReturn = v.object({
  coachId: v.string(),
  email: v.optional(v.string()),
});

export const storeCoach = mutation({
  args: {
    existingCoachId: v.optional(v.string()),
  },
  returns: coachReturn,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const existing = await ctx.db
      .query("coaches")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    const nowMs = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { lastSeenAtMs: nowMs });
      return {
        coachId: existing.coachId,
        ...(existing.email === undefined ? {} : { email: existing.email }),
      };
    }

    const existingCoachId = args.existingCoachId;
    const claimed = existingCoachId
      ? await ctx.db
          .query("coaches")
          .withIndex("by_coach", (q) => q.eq("coachId", existingCoachId))
          .unique()
      : null;
    const coachId =
      claimed === null && existingCoachId
        ? existingCoachId
        : `coach_${identity.subject.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}`;

    await ctx.db.insert("coaches", {
      coachId,
      tokenIdentifier: identity.tokenIdentifier,
      clerkSubject: identity.subject,
      ...(identity.email === undefined || identity.email === null
        ? {}
        : { email: identity.email }),
      createdAtMs: nowMs,
      lastSeenAtMs: nowMs,
    });

    return {
      coachId,
      ...(identity.email ? { email: identity.email } : {}),
    };
  },
});

export const me = query({
  args: {},
  returns: v.union(coachReturn, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const coach = await ctx.db
      .query("coaches")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!coach) return null;
    return {
      coachId: coach.coachId,
      ...(coach.email === undefined ? {} : { email: coach.email }),
    };
  },
});

export const requireCoach = query({
  args: {},
  returns: coachReturn,
  handler: async (ctx) => {
    const coach = await getCurrentCoach(ctx);
    return {
      coachId: coach.coachId,
      ...(coach.email === undefined ? {} : { email: coach.email }),
    };
  },
});
