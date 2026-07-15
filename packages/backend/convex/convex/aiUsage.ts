import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { readAiUsageCredits } from "./lib/aiUsageCredits";

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
