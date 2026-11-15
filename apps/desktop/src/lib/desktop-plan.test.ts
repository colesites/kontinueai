import { describe, expect, test } from "bun:test";
import { displayedUsagePlan, resolveDesktopPlanTier } from "./desktop-plan";

const ready = {
  isUserLoaded: true,
  isAuthLoaded: true,
  isConvexAuthenticated: true,
  currentUser: { plan: "pro_plan" },
  billingUser: {},
  hasStarterPlan: false,
  hasPlusPlan: false,
  hasProPlan: false,
  hasMaxPlan: false,
};

describe("desktop plan startup", () => {
  test("does not resolve or sync a plan until all account data is ready", () => {
    expect(resolveDesktopPlanTier({ ...ready, isUserLoaded: false })).toBeNull();
    expect(resolveDesktopPlanTier({ ...ready, isAuthLoaded: false })).toBeNull();
    expect(resolveDesktopPlanTier({ ...ready, isConvexAuthenticated: false })).toBeNull();
    expect(resolveDesktopPlanTier({ ...ready, billingUser: null })).toBeNull();
    expect(resolveDesktopPlanTier({ ...ready, currentUser: undefined })).toBeNull();
  });

  test("preserves a saved paid plan and handles a new free account", () => {
    expect(resolveDesktopPlanTier(ready)).toBe("pro");
    expect(resolveDesktopPlanTier({ ...ready, currentUser: null })).toBe("free");
    expect(resolveDesktopPlanTier({ ...ready, currentUser: null, hasProPlan: true })).toBe("pro");
  });

  test("does not flash a stale free usage plan during paid account sync", () => {
    expect(displayedUsagePlan(null, "free")).toBeNull();
    expect(displayedUsagePlan("pro", undefined)).toBeNull();
    expect(displayedUsagePlan("pro", "free")).toBeNull();
    expect(displayedUsagePlan("pro", "pro")).toBe("pro");
    expect(displayedUsagePlan("free", "free")).toBe("free");
  });
});
