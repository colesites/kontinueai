import { describe, expect, test } from "bun:test";
import {
	clerkPlanMatchesAnnualPrice,
	clerkPlanMatchesBillingPrice,
	clerkPlanMatchesMonthlyPrice,
	findClerkPlanForTier,
} from "./clerk-plan-matching";

const plans = [
	{
		id: "cplan_starter",
		slug: "starter_plan",
		name: "Starter Plan",
		fee: { amount: 599 },
		annualFee: { amount: 6_000 },
		annualMonthlyFee: { amount: 500 },
	},
	{
		id: "cplan_plus",
		slug: "plus-plan",
		name: "Plus Plan",
		fee: { amount: 1_999 },
		annualFee: { amount: 20_388 },
		annualMonthlyFee: { amount: 1_699 },
	},
	{
		id: "cplan_pro",
		slug: "pro",
		name: "Pro Plan",
		fee: { amount: 5_999 },
		annualFee: { amount: 68_388 },
		annualMonthlyFee: { amount: 5_699 },
	},
	{
		id: "cplan_max",
		slug: "max_plan",
		name: "Max Plan",
		fee: { amount: 14_999 },
		annualFee: { amount: 176_388 },
		annualMonthlyFee: { amount: 14_699 },
	},
];

describe("Clerk pricing plan matching", () => {
	test("matches every paid tier across Clerk slug variants", () => {
		expect(findClerkPlanForTier(plans, "starter")?.id).toBe("cplan_starter");
		expect(findClerkPlanForTier(plans, "plus")?.id).toBe("cplan_plus");
		expect(findClerkPlanForTier(plans, "pro")?.id).toBe("cplan_pro");
		expect(findClerkPlanForTier(plans, "max")?.id).toBe("cplan_max");
	});

	test("requires Clerk's monthly amount to match the product price", () => {
		const starter = findClerkPlanForTier(plans, "starter");
		expect(clerkPlanMatchesMonthlyPrice(starter, 599)).toBe(true);
		expect(clerkPlanMatchesMonthlyPrice(starter, 499)).toBe(false);
		expect(clerkPlanMatchesMonthlyPrice(undefined, 599)).toBe(false);
	});

	test("requires both Clerk annual amounts to match the product price", () => {
		const starter = findClerkPlanForTier(plans, "starter");
		expect(clerkPlanMatchesAnnualPrice(starter, 6_000, 500)).toBe(true);
		expect(clerkPlanMatchesAnnualPrice(starter, 4_800, 500)).toBe(false);
		expect(clerkPlanMatchesAnnualPrice(starter, 6_000, 400)).toBe(false);
		expect(clerkPlanMatchesAnnualPrice(undefined, 6_000, 500)).toBe(false);
	});

	test("validates the selected billing period", () => {
		const plus = findClerkPlanForTier(plans, "plus");
		expect(
			clerkPlanMatchesBillingPrice(plus, "month", 1_999, 20_388, 1_699),
		).toBe(true);
		expect(
			clerkPlanMatchesBillingPrice(plus, "annual", 1_999, 20_388, 1_699),
		).toBe(true);
	});
});
