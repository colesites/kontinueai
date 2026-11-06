// Kode usage: metered in real dollars of model cost, not raw tokens, so cheap
// models go much further than expensive ones and every plan stays profitable.
//
// Two windows, like Claude Code, but friendlier:
//   • session — 5 hours, starting with your first message
//   • weekly  — resets Monday 00:00 UTC
// When a paid plan runs out, Kode 1.0 keeps working from a weekly "relaxed"
// allowance, and extra usage credits cover any model.
//
// All amounts are integer micro-dollars (1 USD = 1_000_000) to avoid float drift.

import type { KodeModelOption, KodePlan, KodePrice } from "./kode";

export const MICROS_PER_USD = 1_000_000;
export const SESSION_MS = 5 * 60 * 60 * 1000;

export type KodeUsageLimits = {
	/** Model-cost budget per month (what the plan is designed around). */
	monthlyMicros: number;
	/** Per 5-hour session. */
	sessionMicros: number;
	/** Per week. */
	weeklyMicros: number;
	/** Extra Kode 1.0 allowance per week after the plan windows run out. */
	relaxedWeeklyMicros: number;
};

const usd = (value: number) => Math.round(value * MICROS_PER_USD);

// Monthly model-cost budgets, about 35–40% of each plan's price.
const MONTHLY_USD: Record<KodePlan, number> = {
	free: 1,
	starter: 1.5,
	plus: 6,
	pro: 22,
	max: 60,
};

const RELAXED_WEEKLY_USD: Record<KodePlan, number> = {
	free: 0,
	starter: 0.5,
	plus: 1.5,
	pro: 5,
	max: 10,
};

// A week can use up to 30% of the month (so a busy week isn't punished), and a
// single 5-hour session up to 30% of the week.
const WEEKLY_SHARE = 0.3;
const SESSION_SHARE = 0.3;

export function getKodeUsageLimits(plan: KodePlan): KodeUsageLimits {
	const monthly = usd(MONTHLY_USD[plan]);
	const weekly = Math.round(monthly * WEEKLY_SHARE);
	return {
		monthlyMicros: monthly,
		weeklyMicros: weekly,
		sessionMicros: Math.round(weekly * SESSION_SHARE),
		relaxedWeeklyMicros: usd(RELAXED_WEEKLY_USD[plan]),
	};
}

export type KodeTokenUsage = {
	inputTokens: number;
	outputTokens: number;
	/** Input tokens served from the provider cache (part of inputTokens). */
	cachedInputTokens?: number;
};

/** Model cost of one request, in micro-dollars (rounded up, never 0 for work). */
export function kodeCostMicros(price: KodePrice, usage: KodeTokenUsage): number {
	const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
	const fresh = usage.inputTokens - cached;
	const usdCost =
		(fresh * price.input + cached * price.cacheRead + usage.outputTokens * price.output) /
		1_000_000;
	const micros = Math.ceil(usdCost * MICROS_PER_USD);
	return usage.inputTokens + usage.outputTokens > 0 ? Math.max(1, micros) : 0;
}

/** Price actually charged for a request (fast variant when Fast mode is on). */
export function kodeEffectivePrice(model: KodeModelOption, fast: boolean): KodePrice {
	return fast && model.fast ? model.fast.price : model.price;
}

/**
 * Relative cost hint shown in the model picker: how many times more usage a
 * typical coding request takes compared with Kode 1.0 (weighted 4:1 input:output).
 */
export function kodeUsageMultiplier(model: KodeModelOption, base: KodeModelOption): number {
	const blend = (price: KodePrice) => price.input * 0.8 + price.output * 0.2;
	return blend(model.price) / blend(base.price);
}

// ─── Extra usage credits ────────────────────────────────────────────────────
// Credits are held in spendable dollars (what the user paid, plus pack bonus).
// A request paid from credits costs its model cost × CREDIT_MARKUP.
export const CREDIT_MARKUP = 1.5;

export type CreditPack = { id: string; priceCents: number; bonusPercent: number };

export const CREDIT_PACKS: CreditPack[] = [
	{ id: "credits_10", priceCents: 1_000, bonusPercent: 0 },
	{ id: "credits_25", priceCents: 2_500, bonusPercent: 5 },
	{ id: "credits_50", priceCents: 5_000, bonusPercent: 10 },
	{ id: "credits_100", priceCents: 10_000, bonusPercent: 15 },
];

/** Spendable credit (micro-dollars) a pack adds. */
export function creditPackMicros(pack: CreditPack): number {
	return Math.round((pack.priceCents / 100) * (1 + pack.bonusPercent / 100) * MICROS_PER_USD);
}

/** Default monthly cap on credit spending, in micro-dollars. */
export const DEFAULT_CREDIT_MONTHLY_LIMIT_MICROS = 50 * MICROS_PER_USD;

/** Start of the current UTC month. */
export function kodeMonthStart(now: number): number {
	const d = new Date(now);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Start of the current UTC week (Monday 00:00). */
export function kodeWeekStart(now: number): number {
	const d = new Date(now);
	const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	const daysSinceMonday = (new Date(dayStart).getUTCDay() + 6) % 7;
	return dayStart - daysSinceMonday * 86_400_000;
}
