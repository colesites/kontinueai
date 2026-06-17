import { useEffect } from "react";
import { useAuth, useUser } from "@clerk/expo";
import { useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { persistedPlanForTier } from "@repo/core/plan-tier";

import { usePlanTier } from "@/hooks/use-plan-tier";
import { getDisplayName } from "@/lib/user-display";

/**
 * Ensures the signed-in Clerk user has a Convex `users` record (mirrors
 * apps/web/src/components/UserSync.tsx). Without this, every owner-scoped
 * query returns empty for first-time mobile users.
 */
export function UserSync() {
  const { user, isLoaded } = useUser();
  const { isLoaded: isAuthLoaded } = useAuth();
  const getOrCreateUser = useMutation(api.users.getOrCreateUser);
  const planTier = usePlanTier();

  useEffect(() => {
    if (!isLoaded || !isAuthLoaded || !user) return;

    void getOrCreateUser({
      clerkUserId: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? "",
      name: getDisplayName(user, "") || undefined,
      imageUrl: user.imageUrl ?? undefined,
      subscriptionStatus: planTier === "free" ? "inactive" : "active",
      plan: persistedPlanForTier(planTier),
    }).catch((error) => {
      console.warn("[user-sync] failed to sync user", error);
    });
  }, [getOrCreateUser, isAuthLoaded, isLoaded, planTier, user]);

  return null;
}
