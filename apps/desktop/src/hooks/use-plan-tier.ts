import { useAuth, useUser } from "@clerk/clerk-react";
import {
  isPaidTier,
  MAX_PLAN_ID,
  PLUS_PLAN_ID,
  PRO_PLAN_ID,
  STARTER_PLAN_ID,
  type BillingUserLike,
  type PlanTier,
} from "@repo/core/plan-tier";
import { useConvexAuth, useConvexConnectionState, useQuery } from "convex/react";

import { api } from "@/lib/convex-api";
import { displayedUsagePlan, resolveDesktopPlanTier } from "@/lib/desktop-plan";
import { readOfflinePlan, writeOfflineValue } from "@/lib/offline-state";
import { useEffect } from "react";
import { useStableUserId } from "@/hooks/use-stable-user-id";

/** Returns null until Clerk and the authenticated Convex user query have loaded. */
export function useResolvedPlanTier(): PlanTier | null {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { isLoaded: isAuthLoaded, has } = useAuth();
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isConvexAuthenticated ? {} : "skip",
  );

  return resolveDesktopPlanTier({
    isUserLoaded,
    isAuthLoaded,
    isConvexAuthenticated,
    currentUser,
    billingUser: user as unknown as BillingUserLike | null | undefined,
    hasStarterPlan: isAuthLoaded && typeof has === "function" && has({ plan: STARTER_PLAN_ID }),
    hasPlusPlan: isAuthLoaded && typeof has === "function" && has({ plan: PLUS_PLAN_ID }),
    hasProPlan: isAuthLoaded && typeof has === "function" && has({ plan: PRO_PLAN_ID }),
    hasMaxPlan: isAuthLoaded && typeof has === "function" && has({ plan: MAX_PLAN_ID }),
  });
}

/** Cached plan is only a display hint; backend authorization remains authoritative. */
export function useDisplayPlanTier(): { plan: PlanTier | null; stale: boolean } {
  const userId = useStableUserId();
  const { isWebSocketConnected } = useConvexConnectionState();
  const { isAuthenticated } = useConvexAuth();
  const resolved = useResolvedPlanTier();
  const usage = useQuery(api.kodeUsage.getUsage, isAuthenticated ? {} : "skip");
  const confirmed = displayedUsagePlan(resolved, usage?.plan);
  const cached = readOfflinePlan(userId);

  useEffect(() => {
    if (isWebSocketConnected && confirmed !== null) {
      writeOfflineValue(userId, "plan", confirmed);
    }
  }, [isWebSocketConnected, confirmed, userId]);

  if (!isWebSocketConnected) return { plan: cached, stale: true };
  return { plan: confirmed ?? cached, stale: confirmed === null };
}

export function usePlanTier(): PlanTier {
  return useDisplayPlanTier().plan ?? "free";
}

export function useIsProPlan(): boolean {
  return isPaidTier(usePlanTier());
}
