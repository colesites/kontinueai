import { ConvexError, v } from "convex/values";
import { appError } from "@repo/core/app-errors";
import { AI_USAGE_CREDIT_COSTS } from "@repo/core/ai-usage-credits";
import { nextPlanWithMore, PLAN_DEFINITIONS } from "@repo/core/plan-config";
import { planTierFromPersisted } from "@repo/core/plan-tier";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import { consumeVideoCredits, readCreditState } from "./lib/videoCredits";
import {
	consumeAiUsageCredits,
	readAiUsageCredits,
	utcMonthStart,
} from "./lib/aiUsageCredits";

// ── Helpers ───────────────────────────────────────────────

async function authenticatedUser(ctx: QueryCtx | MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new Error("Unauthenticated");
	const user = await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
		.first();
	if (!user) throw new Error("User not found");
	return { identity, user };
}

// ── Credits ───────────────────────────────────────────────
// Video credits come from two pools: a monthly allowance (Pro only) and a
// persistent referral-bonus pool (any tier). See lib/videoCredits.ts.

export const getCredits = query({
	args: {},
	handler: async (ctx) => {
		const { user } = await authenticatedUser(ctx);
		const state = await readCreditState(ctx, user);

		return {
			// Back-compat top-level fields mirror the monthly allowance.
			total: state.monthly.total,
			used: state.monthly.used,
			remaining: state.monthly.remaining,
			monthKey: state.monthKey,
			// Combined view the UI uses for gating + display.
			isPro: state.isPro,
			monthly: state.monthly,
			bonus: state.bonus,
			available: state.available,
		};
	},
});

// ── Generation allowance ──────────────────────────────────
// One place decides whether a generation is allowed and what it costs. The API
// routes call `checkGenerationAllowance` BEFORE paying a provider, and
// `deductCredits` re-runs the same check when charging, so a user over their
// limit never triggers a paid generation and always gets a clear reason.

const generationArgs = {
	mediaType: v.optional(v.union(v.literal("image"), v.literal("video"))),
	seconds: v.number(),
	modelId: v.string(),
	resolution: v.optional(v.string()),
	quality: v.optional(v.union(v.literal("standard"), v.literal("pro"))),
};

type GenerationArgs = {
	mediaType?: "image" | "video";
	seconds: number;
	modelId: string;
	resolution?: string;
	quality?: "standard" | "pro";
};


function generationCost({
	mediaType = "video",
	seconds,
	modelId,
	resolution,
	quality = "standard",
}: GenerationArgs): number {
	if (mediaType === "image") return AI_USAGE_CREDIT_COSTS.imageGeneration;
	let multiplier: number = AI_USAGE_CREDIT_COSTS.videoGenerationPerSecond;
	if (modelId.includes("kling")) {
		multiplier = quality === "pro" ? 20 : 15;
	} else if (resolution) {
		if (resolution.includes("1080") || resolution === "1080p") {
			multiplier = 20;
		} else if (resolution.includes("720") || resolution === "720p") {
			multiplier = 15;
		} else if (resolution.includes("480") || resolution === "480p") {
			multiplier = 10;
		}
	}
	return Math.max(1, seconds) * multiplier;
}

async function evaluateAllowance(
	ctx: QueryCtx | MutationCtx,
	user: Doc<"users">,
	args: GenerationArgs,
) {
	const mediaType = args.mediaType ?? "video";
	const isImage = mediaType === "image";
	const label = isImage ? "image" : "video";
	const tier = planTierFromPersisted(user.plan);
	const plan = PLAN_DEFINITIONS[tier];
	const field = isImage ? "imageGenerations" : "videoGenerationSeconds";
	const limit = plan[field];
	const bucketType = isImage
		? ("month_image" as const)
		: ("month_video_seconds" as const);
	const amount = isImage ? 1 : Math.max(1, Math.ceil(args.seconds));
	const cost = generationCost(args);
	const bucketStartMs = utcMonthStart(Date.now());
	const usage = await ctx.db
		.query("usage")
		.withIndex("by_owner_bucket", (q) =>
			q
				.eq("ownerId", user._id)
				.eq("bucketType", bucketType)
				.eq("bucketStartMs", bucketStartMs),
		)
		.unique();
	const used = usage?.requestCount ?? 0;
	const base = { tier, plan, bucketType, bucketStartMs, usage, used, amount, cost };

	if (limit <= 0) {
		const upgradeTo = nextPlanWithMore(tier, (p) => p[field]);
		return {
			...base,
			error: appError("PLAN_REQUIRED", {
				title: `${isImage ? "Image" : "Video"} generation needs an upgrade`,
				message: `${plan.name} doesn't include ${label} generation.${
					upgradeTo
						? ` Upgrade to ${PLAN_DEFINITIONS[upgradeTo].name} to unlock it.`
						: ""
				}`,
				upgradeTo,
			}),
		};
	}
	if (used + amount > limit) {
		const upgradeTo = nextPlanWithMore(tier, (p) => p[field]);
		const unit = isImage ? "images" : "seconds of video";
		return {
			...base,
			error: appError("USAGE_LIMIT_REACHED", {
				message: `You've used ${used} of ${limit} ${unit} on ${plan.name} this month.${
					!isImage && limit - used > 0
						? ` Try a clip of ${limit - used}s or less.`
						: ""
				} It resets on the 1st${
					upgradeTo
						? `, or upgrade to ${PLAN_DEFINITIONS[upgradeTo].name} for more`
						: ""
				}.`,
				upgradeTo,
			}),
		};
	}

	const aiCredits = await readAiUsageCredits(ctx, user);
	if (cost > aiCredits.remaining) {
		const upgradeTo = nextPlanWithMore(tier, (p) => p.aiUsageCredits);
		return {
			...base,
			error: appError("CREDITS_EXHAUSTED", {
				message: `This ${label} needs ${cost} credits and you have ${aiCredits.remaining} left on ${plan.name} this month. Credits reset on the 1st${
					upgradeTo ? `, or upgrade to ${PLAN_DEFINITIONS[upgradeTo].name}` : ""
				}.`,
				upgradeTo,
			}),
		};
	}

	if (!isImage) {
		const videoCredits = await readCreditState(ctx, user);
		if (cost > videoCredits.available) {
			return {
				...base,
				error: appError("CREDITS_EXHAUSTED", {
					message: `This video needs ${cost} video credits and you have ${videoCredits.available}. Try a shorter clip or a lower resolution.`,
				}),
			};
		}
	}

	return { ...base, error: null };
}

export const checkGenerationAllowance = query({
	args: generationArgs,
	handler: async (ctx, args) => {
		const { user } = await authenticatedUser(ctx);
		const result = await evaluateAllowance(ctx, user, args);
		return result.error
			? { ok: false as const, error: result.error }
			: { ok: true as const, cost: result.cost };
	},
});

export const deductCredits = mutation({
	args: generationArgs,
	handler: async (ctx, args) => {
		const { user } = await authenticatedUser(ctx);
		const check = await evaluateAllowance(ctx, user, args);
		if (check.error) throw new ConvexError(check.error);

		await consumeAiUsageCredits(ctx, user, check.cost);
		if (check.usage) {
			await ctx.db.patch(check.usage._id, {
				requestCount: check.used + check.amount,
				updatedAt: Date.now(),
			});
		} else {
			await ctx.db.insert("usage", {
				ownerId: user._id,
				bucketType: check.bucketType,
				bucketStartMs: check.bucketStartMs,
				requestCount: check.amount,
				updatedAt: Date.now(),
			});
		}

		if ((args.mediaType ?? "video") === "image") {
			return { remaining: undefined };
		}

		// Draws from the monthly allowance first (Pro) then the referral-bonus pool.
		return await consumeVideoCredits(ctx, user, check.cost);
	},
});

// ── Creations CRUD ────────────────────────────────────────

export const createCreation = mutation({
	args: {
		mediaType: v.union(v.literal("image"), v.literal("video")),
		mediaUrl: v.string(),
		pathname: v.string(),
		prompt: v.string(),
		modelId: v.string(),
		aspectRatio: v.string(),
		duration: v.optional(v.number()),
		quality: v.optional(v.string()),
		audio: v.optional(v.boolean()),
		referenceImageUrl: v.optional(v.string()),
		resolution: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user } = await authenticatedUser(ctx);
		return await ctx.db.insert("canvasCreations", {
			ownerId: user._id,
			ownerName: user.name ?? undefined,
			ownerImageUrl: user.imageUrl ?? undefined,
			...args,
			isPublished: false,
			likeCount: 0,
			createdAt: Date.now(),
		});
	},
});

export const publishCreation = mutation({
	args: { creationId: v.id("canvasCreations") },
	handler: async (ctx, { creationId }) => {
		const { user } = await authenticatedUser(ctx);
		const creation = await ctx.db.get(creationId);
		if (!creation) throw new Error("Creation not found");
		if (!creation.isPublished && creation.ownerId !== user._id) {
			throw new Error("Creation not found");
		}
		if (creation.ownerId !== user._id) throw new Error("Unauthorized");

		await ctx.db.patch(creationId, { isPublished: !creation.isPublished });
		return { isPublished: !creation.isPublished };
	},
});

export const listPublished = query({
	args: {
		paginationOpts: paginationOptsValidator,
		sortBy: v.optional(v.union(v.literal("likes"), v.literal("recent"))),
	},
	handler: async (ctx, { paginationOpts, sortBy = "likes" }) => {
		if (sortBy === "likes") {
			return await ctx.db
				.query("canvasCreations")
				.withIndex("by_published", (q) => q.eq("isPublished", true))
				.order("desc")
				.paginate(paginationOpts);
		}

		return await ctx.db
			.query("canvasCreations")
			.withIndex("by_published_created", (q) => q.eq("isPublished", true))
			.order("desc")
			.paginate(paginationOpts);
	},
});

export const listMyCreations = query({
	args: { paginationOpts: paginationOptsValidator },
	handler: async (ctx, { paginationOpts }) => {
		const { user } = await authenticatedUser(ctx);
		return await ctx.db
			.query("canvasCreations")
			.withIndex("by_owner", (q) => q.eq("ownerId", user._id))
			.order("desc")
			.paginate(paginationOpts);
	},
});

export const getCreation = query({
	args: { creationId: v.id("canvasCreations") },
	handler: async (ctx, { creationId }) => {
		const creation = await ctx.db.get(creationId);
		if (!creation || creation.isPublished) return creation;

		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();
		return user && creation.ownerId === user._id ? creation : null;
	},
});

// ── Likes ─────────────────────────────────────────────────

export const toggleLike = mutation({
	args: { creationId: v.id("canvasCreations") },
	handler: async (ctx, { creationId }) => {
		const { user } = await authenticatedUser(ctx);

		const creation = await ctx.db.get(creationId);
		if (!creation) throw new Error("Creation not found");
		if (!creation.isPublished && creation.ownerId !== user._id) {
			throw new Error("Creation not found");
		}

		const existingLike = await ctx.db
			.query("canvasLikes")
			.withIndex("by_creation_owner", (q) =>
				q.eq("creationId", creationId).eq("ownerId", user._id),
			)
			.first();

		if (existingLike) {
			await ctx.db.delete(existingLike._id);
			await ctx.db.patch(creationId, {
				likeCount: Math.max(0, creation.likeCount - 1),
			});
			return { liked: false };
		}

		await ctx.db.insert("canvasLikes", {
			creationId,
			ownerId: user._id,
			createdAt: Date.now(),
		});
		await ctx.db.patch(creationId, {
			likeCount: creation.likeCount + 1,
		});
		return { liked: true };
	},
});

export const getMyLikes = query({
	args: {},
	handler: async (ctx) => {
		const { user } = await authenticatedUser(ctx);
		const likes = await ctx.db
			.query("canvasLikes")
			.withIndex("by_owner", (q) => q.eq("ownerId", user._id))
			.collect();
		return likes.map((l) => l.creationId);
	},
});

export const deleteCreation = mutation({
	args: { creationId: v.id("canvasCreations") },
	handler: async (ctx, { creationId }) => {
		const { user } = await authenticatedUser(ctx);
		const creation = await ctx.db.get(creationId);
		if (!creation) throw new Error("Creation not found");
		if (creation.ownerId !== user._id) throw new Error("Unauthorized");

		// Delete all likes for this creation
		const likes = await ctx.db
			.query("canvasLikes")
			.withIndex("by_creation_owner", (q) => q.eq("creationId", creationId))
			.collect();
		for (const like of likes) {
			await ctx.db.delete(like._id);
		}

		await ctx.db.delete(creationId);
		return { pathname: creation.pathname };
	},
});
