import { describe, expect, test } from "bun:test";
import { canAccessModel, canAccessPlanFeature } from "@repo/core/plan-access";
import {
	persistedPlanForTier,
	resolvePlanTierFromBillingSignals,
} from "@repo/core/plan-tier";

describe("plan authorization", () => {
	test("PLAN-001: normalizes all five plans and legacy values", () => {
		expect(resolvePlanTierFromBillingSignals({})).toBe("free");
		expect(
			resolvePlanTierFromBillingSignals({ persistedPlan: " starter_plan " }),
		).toBe("starter");
		expect(
			resolvePlanTierFromBillingSignals({ persistedPlan: "plus_plan" }),
		).toBe("plus");
		expect(
			resolvePlanTierFromBillingSignals({ persistedPlan: "pro_plan" }),
		).toBe("pro");
		expect(
			resolvePlanTierFromBillingSignals({ persistedPlan: "max_plan" }),
		).toBe("max");
		expect(resolvePlanTierFromBillingSignals({ persistedPlan: "pro" })).toBe(
			"starter",
		);
	});

	test("PLAN-002 through PLAN-005: capability matrix matches each tier", () => {
		expect(canAccessPlanFeature("free", "file-upload")).toBe(false);
		expect(canAccessPlanFeature("free", "premium-model")).toBe(false);
		expect(canAccessPlanFeature("free", "kode")).toBe(false);
		expect(canAccessPlanFeature("starter", "file-upload")).toBe(true);
		expect(canAccessPlanFeature("starter", "premium-model")).toBe(false);
		expect(canAccessPlanFeature("starter", "kode")).toBe(false);
		expect(canAccessPlanFeature("plus", "premium-model")).toBe(true);
		expect(canAccessPlanFeature("plus", "canvas")).toBe(false);
		expect(canAccessPlanFeature("pro", "file-upload")).toBe(true);
		expect(canAccessPlanFeature("pro", "premium-model")).toBe(true);
		expect(canAccessPlanFeature("pro", "kode")).toBe(true);
		expect(canAccessPlanFeature("max", "canvas")).toBe(true);
		expect(canAccessModel("starter", "openai/gpt-5.4-mini", "basic")).toBe(
			true,
		);
		expect(canAccessModel("starter", "openai/gpt-5.4-nano", "basic")).toBe(
			false,
		);
		expect(canAccessModel("plus", "openai/gpt-5.4-nano", "basic")).toBe(true);
	});

	test("PLAN-008: cancellation and plan changes resolve immediately", () => {
		for (const tier of ["free", "starter", "plus", "pro", "max"] as const) {
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
