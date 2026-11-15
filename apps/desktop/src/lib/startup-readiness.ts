import { displayedUsagePlan } from "./desktop-plan";
import type { PlanTier } from "@repo/core/plan-tier";

/** Only open the workspace after the account sync and usage subscription agree. */
export function isAccountStartupReady(input: {
  isConvexAuthenticated: boolean;
  plan: PlanTier | null;
  usagePlan: PlanTier | null | undefined;
  synced: boolean;
}): boolean {
  return input.isConvexAuthenticated && input.synced &&
    displayedUsagePlan(input.plan, input.usagePlan) !== null;
}
