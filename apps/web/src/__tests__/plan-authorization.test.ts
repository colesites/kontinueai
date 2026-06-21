import { describe, expect, test } from "bun:test";
import { canAccessPlanFeature } from "@repo/core/plan-access";
import {
	persistedPlanForTier,
	resolvePlanTierFromBillingSignals,
} from "@repo/core/plan-tier";

describe("plan authorization", () => {
	test("PLAN-001: normalizes Free, Starter, Pro, and legacy values", () => {
		expect(resolvePlanTierFromBillingSignals({})).toBe("free");
		expect(
			resolvePlanTierFromBillingSignals({ persistedPlan: " starter_plan " }),
		).toBe("starter");
		expect(
			resolvePlanTierFromBillingSignals({ persistedPlan: "pro_plan" }),
		).toBe("pro");
		expect(resolvePlanTierFromBillingSignals({ persistedPlan: "pro" })).toBe(
			"starter",
		);
	});

	test("PLAN-002 through PLAN-005: capability matrix matches each tier", () => {
		expect(canAccessPlanFeature("free", "file-upload")).toBe(false);
		expect(canAccessPlanFeature("free", "premium-model")).toBe(false);
		expect(canAccessPlanFeature("free", "kode")).toBe(false);
		expect(canAccessPlanFeature("starter", "file-upload")).toBe(true);
		expect(canAccessPlanFeature("starter", "premium-model")).toBe(true);
		expect(canAccessPlanFeature("starter", "kode")).toBe(false);
		expect(canAccessPlanFeature("pro", "file-upload")).toBe(true);
		expect(canAccessPlanFeature("pro", "premium-model")).toBe(true);
		expect(canAccessPlanFeature("pro", "kode")).toBe(true);
	});

	test("PLAN-008: cancellation and plan changes resolve immediately", () => {
		for (const tier of ["free", "starter", "pro"] as const) {
			expect(
				resolvePlanTierFromBillingSignals({
					persistedPlan: persistedPlanForTier(tier),
				}),
			).toBe(tier);
		}
		expect(
			resolvePlanTierFromBillingSignals({
				billingUser: {
					publicMetadata: { subscriptionStatus: "canceled", plan: "free" },
				},
				persistedPlan: "free",
			}),
		).toBe("free");
	});
});
