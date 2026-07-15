type Entitlement = { key?: string | null; name?: string | null };

type BillingMetadata = {
	plan?: string | null;
	subscriptionStatus?: string | null;
};

export type BillingUserLike = {
	entitlements?: Entitlement[] | null;
	publicMetadata?: BillingMetadata | null;
	unsafeMetadata?: BillingMetadata | null;
};

export const PLAN_TIERS = ["free", "starter", "plus", "pro", "max"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const STARTER_PLAN_ID = "starter_plan";
export const PLUS_PLAN_ID = "plus_plan";
export const PRO_PLAN_ID = "pro_plan";
export const MAX_PLAN_ID = "max_plan";

export const CLERK_PLAN_IDS: Record<Exclude<PlanTier, "free">, string> = {
	starter: STARTER_PLAN_ID,
	plus: PLUS_PLAN_ID,
	pro: PRO_PLAN_ID,
	max: MAX_PLAN_ID,
};

type PlanResolutionInput = {
	hasStarterPlan?: boolean;
	hasPlusPlan?: boolean;
	hasProPlan?: boolean;
	hasMaxPlan?: boolean;
	billingUser?: BillingUserLike | null;
	persistedPlan?: string | null;
};

const BILLING_PLAN_ALIASES: Record<Exclude<PlanTier, "free">, Set<string>> = {
	starter: new Set(["starter", STARTER_PLAN_ID, "starter-plan"]),
	plus: new Set(["plus", PLUS_PLAN_ID, "plus-plan"]),
	pro: new Set([
		"pro",
		PRO_PLAN_ID,
		"pro-plan",
		"pro_plus",
		"proplus",
		"pro_v2",
	]),
	max: new Set(["max", MAX_PLAN_ID, "max-plan"]),
};

const PLAN_RANK: Record<PlanTier, number> = {
	free: 0,
	starter: 1,
	plus: 2,
	pro: 3,
	max: 4,
};

function normalizePlanLike(value?: string | null): string {
	return value?.toLowerCase().trim() ?? "";
}

function parseBillingPlanTier(value?: string | null): PlanTier | null {
	const normalized = normalizePlanLike(value);
	if (!normalized) return null;
	if (normalized === "free") return "free";
	for (const tier of ["max", "pro", "plus", "starter"] as const) {
		if (BILLING_PLAN_ALIASES[tier].has(normalized)) return tier;
	}
	return null;
}

function parsePlanTierFromEntitlements(
	entitlements?: Entitlement[] | null,
): PlanTier | null {
	let detectedTier: PlanTier | null = null;
	for (const entitlement of entitlements ?? []) {
		const tier =
			parseBillingPlanTier(entitlement.key) ??
			parseBillingPlanTier(entitlement.name);
		if (!tier) continue;
		if (!detectedTier || PLAN_RANK[tier] > PLAN_RANK[detectedTier]) {
			detectedTier = tier;
		}
	}
	return detectedTier;
}

export function resolvePlanTierFromBillingSignals({
	hasStarterPlan = false,
	hasPlusPlan = false,
	hasProPlan = false,
	hasMaxPlan = false,
	billingUser,
	persistedPlan,
}: PlanResolutionInput): PlanTier {
	if (hasMaxPlan) return "max";
	if (hasProPlan) return "pro";
	if (hasPlusPlan) return "plus";
	if (hasStarterPlan) return "starter";

	const planFromMetadata =
		billingUser?.publicMetadata?.plan ?? billingUser?.unsafeMetadata?.plan;
	const metadataTier = parseBillingPlanTier(planFromMetadata);
	if (metadataTier) return metadataTier;

	const entitlementTier = parsePlanTierFromEntitlements(
		billingUser?.entitlements,
	);
	if (entitlementTier) return entitlementTier;

	const persistedTier = planTierFromPersisted(persistedPlan);
	const subscriptionStatusFromMetadata = normalizePlanLike(
		billingUser?.publicMetadata?.subscriptionStatus ??
			billingUser?.unsafeMetadata?.subscriptionStatus,
	);
	if (subscriptionStatusFromMetadata === "active") {
		return persistedTier === "free" ? "starter" : persistedTier;
	}

	return persistedTier;
}

export function isPaidTier(tier: PlanTier): boolean {
	return tier !== "free";
}

export function isPlanAtLeast(tier: PlanTier, minimum: PlanTier): boolean {
	return PLAN_RANK[tier] >= PLAN_RANK[minimum];
}

// Persisted Convex values keep the old bare `pro` alias mapped to Starter.
// New billing plans persist canonical ids such as `pro_plan`, so there is no
// ambiguity for new subscriptions.
export function planTierFromPersisted(plan?: string | null): PlanTier {
	const normalized = normalizePlanLike(plan);
	if (!normalized || normalized === "free") return "free";
	if (normalized === "pro") return "starter";
	return parseBillingPlanTier(normalized) ?? "free";
}

export function isPaidPersistedPlan(plan?: string | null): boolean {
	return planTierFromPersisted(plan) !== "free";
}

export const IMPORT_UPLOAD_LIMIT_BYTES: Record<PlanTier, number> = {
	free: 500 * 1024 * 1024,
	starter: 500 * 1024 * 1024,
	plus: 1024 * 1024 * 1024,
	pro: 2 * 1024 * 1024 * 1024,
	max: 2 * 1024 * 1024 * 1024,
};

export function getImportUploadLimitBytes(tier: PlanTier): number {
	return IMPORT_UPLOAD_LIMIT_BYTES[tier];
}

export function planLabel(tier: PlanTier): string {
	return tier === "free"
		? "Free"
		: tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function persistedPlanForTier(tier: PlanTier): string {
	return tier === "free" ? "free" : CLERK_PLAN_IDS[tier];
}

export function isProFromBillingSignals(
	input: Omit<PlanResolutionInput, "persistedPlan">,
): boolean {
	return isPaidTier(resolvePlanTierFromBillingSignals(input));
}

export function isProUser(input: PlanResolutionInput): boolean {
	return isPaidTier(resolvePlanTierFromBillingSignals(input));
}
