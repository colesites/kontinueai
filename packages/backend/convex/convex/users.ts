import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getMemoryLimitBytesForPlan } from "@repo/core/memory";
import { isPaidPersistedPlan } from "@repo/core/plan-tier";
import { grantBonusCredits, REFERRAL_REWARD_CREDITS } from "./lib/videoCredits";

// ── Referral helpers ──────────────────────────────────────

// Record that a new user (B) was invited by the owner of `code`. Only runs at
// account creation, so existing users can never be retro-attributed. Silently
// ignores unknown codes, self-referrals, and already-referred users.
async function attributeReferralOnSignup(
	ctx: MutationCtx,
	refereeUserId: Id<"users">,
	code?: string,
) {
	const normalized = code?.trim();
	if (!normalized) return;

	const referrer = await ctx.db
		.query("users")
		.withIndex("by_referral_code", (q) => q.eq("referralCode", normalized))
		.first();
	if (!referrer || referrer._id === refereeUserId) return;

	const existingReferral = await ctx.db
		.query("referrals")
		.withIndex("by_referee", (q) => q.eq("refereeUserId", refereeUserId))
		.first();
	if (existingReferral) return;

	await ctx.db.insert("referrals", {
		referrerUserId: referrer._id,
		refereeUserId,
		code: normalized,
		status: "pending",
		createdAt: Date.now(),
	});
}

// When an invited user becomes a paying customer, grant their referrer the
// bonus video credits. Idempotent: the pending → rewarded status flip ensures
// the reward is only ever granted once per invited user.
async function maybeRewardReferral(
	ctx: MutationCtx,
	refereeUserId: Id<"users">,
	refereePlan?: string | null,
) {
	if (!isPaidPersistedPlan(refereePlan)) return;

	const referral = await ctx.db
		.query("referrals")
		.withIndex("by_referee", (q) => q.eq("refereeUserId", refereeUserId))
		.first();
	if (!referral || referral.status !== "pending") return;

	await ctx.db.patch(referral._id, {
		status: "rewarded",
		rewardCredits: REFERRAL_REWARD_CREDITS,
		rewardedAt: Date.now(),
	});
	await grantBonusCredits(
		ctx,
		referral.referrerUserId,
		REFERRAL_REWARD_CREDITS,
	);
}

export const getOrCreateUser = mutation({
	args: {
		email: v.string(),
		name: v.optional(v.string()),
		imageUrl: v.optional(v.string()),
		subscriptionStatus: v.optional(v.string()),
		plan: v.optional(v.string()),
		// Referral code captured from an invite link, applied only on first signup.
		referralCode: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");
		const clerkUserId = identity.subject;
		const now = Date.now();
		const memoryLimitBytes = getMemoryLimitBytesForPlan(args.plan);
		const existing = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkUserId))
			.unique();

		if (existing) {
			// Update if needed
			const patches: Partial<
				Pick<
					typeof existing,
					| "name"
					| "imageUrl"
					| "subscriptionStatus"
					| "plan"
					| "memoryLimitBytes"
					| "updatedAt"
				>
			> = {};
			if (existing.name !== args.name) patches.name = args.name;
			if (existing.imageUrl !== args.imageUrl) patches.imageUrl = args.imageUrl;
			if (existing.subscriptionStatus !== args.subscriptionStatus)
				patches.subscriptionStatus = args.subscriptionStatus;
			if (existing.plan !== args.plan) patches.plan = args.plan;
			if (existing.memoryLimitBytes !== memoryLimitBytes) {
				patches.memoryLimitBytes = memoryLimitBytes;
			}
			patches.updatedAt = now;

			if (Object.keys(patches).length > 0) {
				await ctx.db.patch(existing._id, patches);
			}
			// Reward a pending referral if this sync reflects the user becoming paid.
			await maybeRewardReferral(ctx, existing._id, args.plan);
			return existing._id;
		}

		const newUserId = await ctx.db.insert("users", {
			clerkUserId,
			email: args.email,
			name: args.name,
			imageUrl: args.imageUrl,
			subscriptionStatus: args.subscriptionStatus,
			plan: args.plan,
			memoryUsedBytes: 0,
			memoryLimitBytes,
			fileStorageUsedBytes: 0,
			createdAt: now,
			updatedAt: now,
		});

		// Attribute the invite (if any) at creation time, then reward immediately in
		// the rare case the account is already on a paid plan.
		await attributeReferralOnSignup(ctx, newUserId, args.referralCode);
		await maybeRewardReferral(ctx, newUserId, args.plan);

		return newUserId;
	},
});

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return null;
		}

		return await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();
	},
});

export const getDefaultModel = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return null;
		}

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();

		if (!user) {
			return null;
		}

		const settings = await ctx.db
			.query("userSettings")
			.withIndex("by_owner", (q) => q.eq("ownerId", user._id))
			.collect();

		return settings[0]?.defaultModel ?? null;
	},
});

export const setDefaultModel = mutation({
	args: { modelId: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();

		if (!user) {
			throw new Error("User not found");
		}

		const settings = await ctx.db
			.query("userSettings")
			.withIndex("by_owner", (q) => q.eq("ownerId", user._id))
			.collect();

		const [existing, ...duplicates] = settings;
		if (existing) {
			if (existing.defaultModel !== args.modelId) {
				await ctx.db.patch(existing._id, { defaultModel: args.modelId });
			}
		} else {
			await ctx.db.insert("userSettings", {
				ownerId: user._id,
				defaultModel: args.modelId,
			});
		}

		await Promise.all(duplicates.map((setting) => ctx.db.delete(setting._id)));

		return args.modelId;
	},
});
