import {
  resolvePlanTierFromBillingSignals,
  type BillingUserLike,
  type PlanTier,
} from "@repo/core/plan-tier";

type DesktopPlanSignals = {
  isUserLoaded: boolean;
  isAuthLoaded: boolean;
  isConvexAuthenticated: boolean;
  currentUser: { plan?: string | null } | null | undefined;
  billingUser: BillingUserLike | null | undefined;
  hasStarterPlan: boolean;
  hasPlusPlan: boolean;
  hasProPlan: boolean;
  hasMaxPlan: boolean;
};

/** A null tier means the account or its saved plan has not finished loading. */
export function resolveDesktopPlanTier(signals: DesktopPlanSignals): PlanTier | null {
  if (
    !signals.isUserLoaded ||
    !signals.isAuthLoaded ||
    !signals.isConvexAuthenticated ||
    !signals.billingUser ||
    signals.currentUser === undefined
  ) {
    return null;
  }

  return resolvePlanTierFromBillingSignals({
    ...signals,
    persistedPlan: signals.currentUser?.plan,
  });
}

/** Do not show a plan until the usage backend agrees with the resolved tier. */
export function displayedUsagePlan(
  resolvedPlan: PlanTier | null,
  usagePlan: PlanTier | null | undefined,
): PlanTier | null {
  return resolvedPlan !== null && usagePlan === resolvedPlan ? usagePlan : null;
}
