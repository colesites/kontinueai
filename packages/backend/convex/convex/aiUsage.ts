import { AI_USAGE_CREDIT_COSTS } from "@repo/core/ai-usage-credits";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	consumeAiUsageCredits,
	readAiUsageCredits,
} from "./lib/aiUsageCredits";

async function currentUser(ctx: QueryCtx | MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new Error("Unauthenticated");
	const user = await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
		.unique();
	if (!user) throw new Error("User not found");
	return user;
}

export const getUsage = query({
	args: {},
	handler: async (ctx) => {
		const state = await readAiUsageCredits(ctx, await currentUser(ctx));
		return {
			tier: state.tier,
			used: state.used,
			limit: state.limit,
			remaining: state.remaining,
		};
	},
});

// Charge one sandboxed code run against the user's AI usage credits. Called
// when a run actually executes, so a turn where the model writes no code is
// free. Returns allowed:false rather than throwing, so an exhausted balance
// degrades to "I couldn't run that" instead of killing the whole chat turn.
export const consumeCodeExecution = mutation({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		allowed: boolean;
		reason: "ok" | "unauthenticated" | "credits_exhausted";
	}> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return { allowed: false, reason: "unauthenticated" };
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();
		if (!user) return { allowed: false, reason: "unauthenticated" };
		try {
			await consumeAiUsageCredits(
				ctx,
				user,
				AI_USAGE_CREDIT_COSTS.codeExecution,
			);
		} catch (error) {
			if (error instanceof ConvexError) {
				return { allowed: false, reason: "credits_exhausted" };
			}
			throw error;
		}
		return { allowed: true, reason: "ok" };
	},
});
