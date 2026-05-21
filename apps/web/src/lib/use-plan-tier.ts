"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
// import { api } from "@repo/convex/convex/_generated/api";
import { api } from "@repo/convex/convex/_generated/api";

import {
  isPaidTier,
  PRO_PLAN_ID,
  resolvePlanTierFromBillingSignals,
  STARTER_PLAN_ID,
  type BillingUserLike,
  type PlanTier,
} from "@repo/core/plan-tier";

export function usePlanTier(): PlanTier {
  const { user } = useUser();
  const { isLoaded: isAuthLoaded, has } = useAuth();
  const currentUser = useQuery(api.users.getCurrentUser, {});

  const hasProPlan =
    isAuthLoaded && typeof has === "function"
      ? has({ plan: PRO_PLAN_ID })
      : false;
  const hasStarterPlan =
    isAuthLoaded && typeof has === "function"
      ? has({ plan: STARTER_PLAN_ID })
      : false;

  return resolvePlanTierFromBillingSignals({
    hasStarterPlan,
    hasProPlan,
    billingUser: user as unknown as BillingUserLike | null | undefined,
    persistedPlan: currentUser?.plan,
  });
}

export function useIsProPlan(): boolean {
  return isPaidTier(usePlanTier());
}
