import { CLERK_PLAN_IDS, type PlanTier } from "@repo/core/plan-tier";

export type ClerkPlanLike = {
	id: string;
	slug: string;
	name: string;
	fee?: { amount: number } | null;
	annualFee?: { amount: number } | null;
	annualMonthlyFee?: { amount: number } | null;
};

export type BillingPeriod = "month" | "annual";

function normalize(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[\s_-]+/g, "-");
}

export function findClerkPlanForTier<T extends ClerkPlanLike>(
	plans: T[],
	tier: Exclude<PlanTier, "free">,
): T | undefined {
	const expected = new Set(
		[
			tier,
			`${tier}-plan`,
			CLERK_PLAN_IDS[tier],
			CLERK_PLAN_IDS[tier].replaceAll("_", "-"),
		].map(normalize),
	);

	return plans.find(
		(plan) =>
			expected.has(normalize(plan.slug)) || expected.has(normalize(plan.name)),
	);
}

export function clerkPlanMatchesMonthlyPrice(
	plan: ClerkPlanLike | undefined,
	expectedPriceCents: number,
): boolean {
	return plan?.fee?.amount === expectedPriceCents;
}

export function clerkPlanMatchesAnnualPrice(
	plan: ClerkPlanLike | undefined,
	expectedAnnualPriceCents: number,
	expectedAnnualMonthlyPriceCents: number,
): boolean {
	return (
		plan?.annualFee?.amount === expectedAnnualPriceCents &&
		plan.annualMonthlyFee?.amount === expectedAnnualMonthlyPriceCents
	);
}

export function clerkPlanMatchesBillingPrice(
	plan: ClerkPlanLike | undefined,
	period: BillingPeriod,
	expectedMonthlyPriceCents: number,
	expectedAnnualPriceCents: number,
	expectedAnnualMonthlyPriceCents: number,
): boolean {
	return period === "month"
		? clerkPlanMatchesMonthlyPrice(plan, expectedMonthlyPriceCents)
		: clerkPlanMatchesAnnualPrice(
				plan,
				expectedAnnualPriceCents,
				expectedAnnualMonthlyPriceCents,
			);
}
