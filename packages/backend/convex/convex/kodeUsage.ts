import { v } from "convex/values";
import {
	getKodeModelAccess,
	getKodeModelById,
	isKodeModel,
	type KodeModelOption,
	type KodePlan,
} from "@repo/ai/lib/kode";
import {
	CREDIT_MARKUP,
	DEFAULT_CREDIT_MONTHLY_LIMIT_MICROS,
	getKodeUsageLimits,
	kodeCostMicros,
	kodeEffectivePrice,
	kodeMonthStart,
	kodeWeekStart,
	SESSION_MS,
	type KodeUsageLimits,
} from "@repo/ai/lib/kode-usage";
import { getPersistedPlanTier } from "../lib/plan";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// Kode usage, metered in micro-dollars of real model cost.
//
// The Kontinue server (apps/web/src/app/api/kode/chat) calls `authorize`
// before every model request and `record` after it with the provider's token
// counts. Cost is computed HERE from the model catalog, so callers can never
// set their own price. `record` only ever adds usage.
//
// Extra usage credits are held in spendable dollars; a request paid from
// credits costs model cost × CREDIT_MARKUP.
// ─────────────────────────────────────────────────────────────────────────────

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const SESSION_BUCKET = "session_kode_cost" as const;
const WEEK_BUCKET = "week_kode_cost" as const;
const RELAXED_BUCKET = "week_kode_relaxed" as const;
const CREDIT_MONTH_BUCKET = "month_kode_credits" as const;

type Ctx = QueryCtx | MutationCtx;
type Source = "plan" | "relaxed" | "credits";
type BucketType =
	| typeof SESSION_BUCKET
	| typeof WEEK_BUCKET
	| typeof RELAXED_BUCKET
	| typeof CREDIT_MONTH_BUCKET;

type UsageState = {
	user: Doc<"users">;
	plan: KodePlan;
	limits: KodeUsageLimits;
	now: number;
	session: { row: Doc<"usage"> | null; used: number; startMs: number | null };
	weekStartMs: number;
	monthStartMs: number;
	weekly: { row: Doc<"usage"> | null; used: number };
	relaxed: { row: Doc<"usage"> | null; used: number };
	credits: {
		row: Doc<"kodeCredits"> | null;
		balance: number;
		autoUse: boolean;
		monthlyLimit: number;
		monthRow: Doc<"usage"> | null;
		monthSpent: number;
	};
};

async function currentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) return null;
	return await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
		.unique();
}

async function bucket(
	ctx: Ctx,
	ownerId: Id<"users">,
	bucketType: BucketType,
	bucketStartMs: number,
): Promise<Doc<"usage"> | null> {
	return await ctx.db
		.query("usage")
		.withIndex("by_owner_bucket", (q) =>
			q.eq("ownerId", ownerId).eq("bucketType", bucketType).eq("bucketStartMs", bucketStartMs),
		)
		.unique();
}

async function loadState(ctx: Ctx, user: Doc<"users">, now: number): Promise<UsageState> {
	const plan = getPersistedPlanTier(user.plan) as KodePlan;
	const weekStartMs = kodeWeekStart(now);
	const monthStartMs = kodeMonthStart(now);

	// The latest session; it's active for 5 hours from its first request.
	const latestSession = await ctx.db
		.query("usage")
		.withIndex("by_owner_bucket", (q) =>
			q.eq("ownerId", user._id).eq("bucketType", SESSION_BUCKET),
		)
		.order("desc")
		.first();
	const sessionActive = !!latestSession && now < latestSession.bucketStartMs + SESSION_MS;

	const [weekRow, relaxedRow, monthRow, creditsRow] = await Promise.all([
		bucket(ctx, user._id, WEEK_BUCKET, weekStartMs),
		bucket(ctx, user._id, RELAXED_BUCKET, weekStartMs),
		bucket(ctx, user._id, CREDIT_MONTH_BUCKET, monthStartMs),
		ctx.db
			.query("kodeCredits")
			.withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
			.unique(),
	]);

	return {
		user,
		plan,
		limits: getKodeUsageLimits(plan),
		now,
		session: {
			row: sessionActive ? latestSession : null,
			used: sessionActive ? latestSession.requestCount : 0,
			startMs: sessionActive ? latestSession.bucketStartMs : null,
		},
		weekStartMs,
		monthStartMs,
		weekly: { row: weekRow, used: weekRow?.requestCount ?? 0 },
		relaxed: { row: relaxedRow, used: relaxedRow?.requestCount ?? 0 },
		credits: {
			row: creditsRow,
			balance: creditsRow?.balanceMicros ?? 0,
			autoUse: creditsRow?.autoUse ?? true,
			monthlyLimit: creditsRow?.monthlyLimitMicros ?? DEFAULT_CREDIT_MONTHLY_LIMIT_MICROS,
			monthRow,
			monthSpent: monthRow?.requestCount ?? 0,
		},
	};
}

type Decision =
	| { allowed: true; source: Source }
	| { allowed: false; reason: "locked" | "limit" | "credits"; message: string; resetAt: number | null };

function creditsSpendable(state: UsageState): boolean {
	return state.credits.balance > 0 && state.credits.monthSpent < state.credits.monthlyLimit;
}

/** Which pool pays for the next request with this model, if any. */
function decide(state: UsageState, model: KodeModelOption): Decision {
	const access = getKodeModelAccess(model, state.plan);
	const sessionResetAt = state.session.startMs !== null ? state.session.startMs + SESSION_MS : null;
	const weekResetAt = state.weekStartMs + WEEK_MS;

	if (access === "locked") {
		return {
			allowed: false,
			reason: "locked",
			message: `${model.name} isn't included in your plan. Upgrade to use it.`,
			resetAt: null,
		};
	}

	if (access === "credits") {
		return creditsSpendable(state)
			? { allowed: true, source: "credits" }
			: {
					allowed: false,
					reason: "credits",
					message:
						state.credits.balance > 0
							? `You've reached your monthly credit spend limit. Raise it in Settings → Usage.`
							: `${model.name} uses usage credits on your plan. Buy credits, or upgrade to Max to include it.`,
					resetAt: null,
				};
	}

	const sessionLeft = state.limits.sessionMicros - state.session.used;
	const weeklyLeft = state.limits.weeklyMicros - state.weekly.used;
	if (sessionLeft > 0 && weeklyLeft > 0) return { allowed: true, source: "plan" };

	// Paid plans keep coding on Kode 1.0 from the relaxed weekly allowance.
	if (isKodeModel(model.id) && state.limits.relaxedWeeklyMicros - state.relaxed.used > 0) {
		return { allowed: true, source: "relaxed" };
	}
	if (state.credits.autoUse && creditsSpendable(state)) return { allowed: true, source: "credits" };

	const weeklyOut = weeklyLeft <= 0;
	const relaxedNote =
		state.limits.relaxedWeeklyMicros > 0 && !isKodeModel(model.id)
			? " Kode 1.0 is still available."
			: "";
	const creditNote =
		state.credits.balance > 0 && !state.credits.autoUse
			? " Turn on usage credits in Settings → Usage to keep going."
			: "";
	return {
		allowed: false,
		reason: "limit",
		message: `You've reached your ${weeklyOut ? "weekly" : "5-hour"} Kode limit.${relaxedNote}${creditNote}`,
		resetAt: weeklyOut ? weekResetAt : sessionResetAt,
	};
}

async function addToBucket(
	ctx: MutationCtx,
	ownerId: Id<"users">,
	row: Doc<"usage"> | null,
	bucketType: BucketType,
	bucketStartMs: number,
	micros: number,
	now: number,
) {
	if (row) {
		await ctx.db.patch(row._id, { requestCount: row.requestCount + micros, updatedAt: now });
	} else {
		await ctx.db.insert("usage", {
			ownerId,
			bucketType,
			bucketStartMs,
			requestCount: micros,
			updatedAt: now,
		});
	}
}

async function addCredits(
	ctx: MutationCtx,
	ownerId: Id<"users">,
	micros: number,
	now: number,
) {
	const row = await ctx.db
		.query("kodeCredits")
		.withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
		.unique();
	if (row) {
		await ctx.db.patch(row._id, { balanceMicros: row.balanceMicros + micros, updatedAt: now });
	} else {
		await ctx.db.insert("kodeCredits", { ownerId, balanceMicros: micros, updatedAt: now });
	}
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Usage meters for the context popover, Settings → Usage and the model picker. */
export const getUsage = query({
	args: {},
	handler: async (ctx) => {
		const user = await currentUser(ctx);
		if (!user) return null;
		const state = await loadState(ctx, user, Date.now());
		return {
			plan: state.plan,
			session: {
				used: state.session.used,
				limit: state.limits.sessionMicros,
				// null = no active session; the 5 hours start with your next request.
				resetAt: state.session.startMs !== null ? state.session.startMs + SESSION_MS : null,
			},
			weekly: {
				used: state.weekly.used,
				limit: state.limits.weeklyMicros,
				resetAt: state.weekStartMs + WEEK_MS,
			},
			relaxed: { used: state.relaxed.used, limit: state.limits.relaxedWeeklyMicros },
			creditsMicros: state.credits.balance,
			credits: {
				balance: state.credits.balance,
				autoUse: state.credits.autoUse,
				monthlyLimit: state.credits.monthlyLimit,
				monthSpent: state.credits.monthSpent,
				monthResetAt: kodeMonthStart(state.monthStartMs + 32 * DAY_MS),
			},
		};
	},
});

/** This week's Kode usage for the Usage page: per day, per hour and per model. */
export const getUsageHistory = query({
	args: {},
	handler: async (ctx) => {
		const user = await currentUser(ctx);
		if (!user) return null;
		const now = Date.now();
		const weekStartMs = kodeWeekStart(now);
		const rows = await ctx.db
			.query("kodeUsageHourly")
			.withIndex("by_ownerId_and_hourStartMs_and_modelId", (q) =>
				q.eq("ownerId", user._id).gte("hourStartMs", weekStartMs),
			)
			.take(2000);

		const hours: { hourStartMs: number; micros: number; requests: number }[] = [];
		const byHour = new Map<number, { micros: number; requests: number }>();
		const byModel = new Map<string, { micros: number; requests: number }>();
		for (const row of rows) {
			const hour = byHour.get(row.hourStartMs) ?? { micros: 0, requests: 0 };
			hour.micros += row.micros;
			hour.requests += row.requests;
			byHour.set(row.hourStartMs, hour);
			const model = byModel.get(row.modelId) ?? { micros: 0, requests: 0 };
			model.micros += row.micros;
			model.requests += row.requests;
			byModel.set(row.modelId, model);
		}
		for (const [hourStartMs, value] of byHour) hours.push({ hourStartMs, ...value });
		hours.sort((a, b) => a.hourStartMs - b.hourStartMs);

		return {
			weekStartMs,
			hours,
			models: [...byModel.entries()]
				.map(([modelId, value]) => ({ modelId, ...value }))
				.sort((a, b) => b.micros - a.micros),
		};
	},
});

/** Called by the server before a model request. */
export const authorize = query({
	args: { modelId: v.string() },
	handler: async (ctx, args) => {
		const user = await currentUser(ctx);
		if (!user) {
			return { allowed: false as const, reason: "auth" as const, message: "Sign in to use Kode.", resetAt: null };
		}
		const model = getKodeModelById(args.modelId);
		if (!model) {
			return { allowed: false as const, reason: "locked" as const, message: "Unknown Kode model.", resetAt: null };
		}
		const state = await loadState(ctx, user, Date.now());
		return { ...decide(state, model), plan: state.plan };
	},
});

const recordArgs = {
	modelId: v.string(),
	fast: v.boolean(),
	inputTokens: v.number(),
	outputTokens: v.number(),
	cachedInputTokens: v.optional(v.number()),
};

type RecordArgs = {
	modelId: string;
	fast: boolean;
	inputTokens: number;
	outputTokens: number;
	cachedInputTokens?: number;
};

function requireServerSecret(secret: string) {
	const expected = process.env.KODE_SERVER_SECRET;
	if (!expected || secret !== expected) throw new Error("Unauthorized");
}

async function recordUsage(ctx: MutationCtx, user: Doc<"users">, args: RecordArgs) {
	const model = getKodeModelById(args.modelId);
	if (!model) throw new Error("Unknown Kode model");
	const clamp = (n: number | undefined) => Math.max(0, Math.floor(n ?? 0));
	const micros = kodeCostMicros(kodeEffectivePrice(model, args.fast && !!model.fast), {
		inputTokens: clamp(args.inputTokens),
		outputTokens: clamp(args.outputTokens),
		cachedInputTokens: clamp(args.cachedInputTokens),
	});
	if (micros <= 0) return { micros: 0 };

	const now = Date.now();
	const state = await loadState(ctx, user, now);
	const decision = decide(state, model);
	// A request that was authorized but finished after the pool ran dry is
	// still charged to the plan windows (overshoot is at most one request).
	const source: Source = decision.allowed ? decision.source : "plan";

	if (source === "credits") {
		const spend = Math.round(micros * CREDIT_MARKUP);
		if (state.credits.row) {
			await ctx.db.patch(state.credits.row._id, {
				balanceMicros: Math.max(0, state.credits.balance - spend),
				updatedAt: now,
			});
		}
		await addToBucket(ctx, user._id, state.credits.monthRow, CREDIT_MONTH_BUCKET, state.monthStartMs, spend, now);
	} else if (source === "relaxed") {
		await addToBucket(ctx, user._id, state.relaxed.row, RELAXED_BUCKET, state.weekStartMs, micros, now);
	} else {
		await addToBucket(ctx, user._id, state.session.row, SESSION_BUCKET, state.session.startMs ?? now, micros, now);
		await addToBucket(ctx, user._id, state.weekly.row, WEEK_BUCKET, state.weekStartMs, micros, now);
	}

	// Hourly history for the Usage page.
	const hourStartMs = Math.floor(now / HOUR_MS) * HOUR_MS;
	const hourly = await ctx.db
		.query("kodeUsageHourly")
		.withIndex("by_ownerId_and_hourStartMs_and_modelId", (q) =>
			q.eq("ownerId", user._id).eq("hourStartMs", hourStartMs).eq("modelId", model.id),
		)
		.unique();
	if (hourly) {
		await ctx.db.patch(hourly._id, { micros: hourly.micros + micros, requests: hourly.requests + 1 });
	} else {
		await ctx.db.insert("kodeUsageHourly", {
			ownerId: user._id,
			hourStartMs,
			modelId: model.id,
			micros,
			requests: 1,
		});
	}
	return { micros, source };
}

/** Record a request's usage as the signed-in user. */
export const record = mutation({
	args: recordArgs,
	handler: async (ctx, args) => {
		const user = await currentUser(ctx);
		if (!user) throw new Error("Not authenticated");
		return await recordUsage(ctx, user, args);
	},
});

/**
 * Record usage from the Kontinue server after a stream finishes. Uses a shared
 * secret instead of the user's token, which may expire during long replies.
 */
export const recordFromServer = mutation({
	args: { ...recordArgs, secret: v.string(), clerkUserId: v.string() },
	handler: async (ctx, { secret, clerkUserId, ...args }) => {
		requireServerSecret(secret);
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkUserId))
			.unique();
		if (!user) throw new Error("User not found");
		return await recordUsage(ctx, user, args);
	},
});

/** Settings → Usage: auto-use credits and the monthly credit spend cap. */
export const setCreditSettings = mutation({
	args: {
		autoUse: v.optional(v.boolean()),
		monthlyLimitMicros: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await currentUser(ctx);
		if (!user) throw new Error("Not authenticated");
		if (
			args.monthlyLimitMicros !== undefined &&
			(!Number.isFinite(args.monthlyLimitMicros) || args.monthlyLimitMicros < 0)
		) {
			throw new Error("Invalid limit");
		}
		const now = Date.now();
		const row = await ctx.db
			.query("kodeCredits")
			.withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
			.unique();
		const patch = {
			...(args.autoUse !== undefined ? { autoUse: args.autoUse } : {}),
			...(args.monthlyLimitMicros !== undefined
				? { monthlyLimitMicros: Math.round(args.monthlyLimitMicros) }
				: {}),
			updatedAt: now,
		};
		if (row) await ctx.db.patch(row._id, patch);
		else await ctx.db.insert("kodeCredits", { ownerId: user._id, balanceMicros: 0, ...patch });
		return null;
	},
});

/**
 * Credit purchase from the Stripe webhook (apps/web). Guarded by a shared
 * secret and idempotent per payment, so retries never grant twice.
 */
export const grantCreditsFromPayment = mutation({
	args: {
		secret: v.string(),
		clerkUserId: v.string(),
		paymentId: v.string(),
		micros: v.number(),
		amountCents: v.number(),
	},
	handler: async (ctx, args) => {
		requireServerSecret(args.secret);
		if (!Number.isFinite(args.micros) || args.micros <= 0) throw new Error("Invalid amount");

		const existing = await ctx.db
			.query("kodeCreditGrants")
			.withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId))
			.unique();
		if (existing) return { granted: false };

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.clerkUserId))
			.unique();
		if (!user) throw new Error("User not found");

		const now = Date.now();
		await ctx.db.insert("kodeCreditGrants", {
			ownerId: user._id,
			paymentId: args.paymentId,
			micros: Math.round(args.micros),
			amountCents: Math.round(args.amountCents),
			createdAt: now,
		});
		await addCredits(ctx, user._id, Math.round(args.micros), now);
		return { granted: true };
	},
});

/** Add credits directly (support tooling). */
export const grantCredits = internalMutation({
	args: { userId: v.id("users"), micros: v.number() },
	handler: async (ctx, args) => {
		if (!Number.isFinite(args.micros) || args.micros <= 0) throw new Error("Invalid amount");
		await addCredits(ctx, args.userId, Math.round(args.micros), Date.now());
		return null;
	},
});
