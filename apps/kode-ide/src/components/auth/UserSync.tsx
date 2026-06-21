import { useAuth, useUser } from "@clerk/clerk-react";
import { persistedPlanForTier } from "@repo/core/plan-tier";
import { useMutation } from "convex/react";
import { useEffect } from "react";

import { usePlanTier } from "@/hooks/use-plan-tier";
import { api } from "@/lib/convex-api";

export function UserSync() {
  const { user, isLoaded } = useUser();
  const { isLoaded: isAuthLoaded } = useAuth();
  const getOrCreateUser = useMutation(api.users.getOrCreateUser);
  const planTier = usePlanTier();

  useEffect(() => {
    if (!isLoaded || !isAuthLoaded || !user) return;

    void getOrCreateUser({
      email: user.primaryEmailAddress?.emailAddress ?? "",
      name: user.fullName ?? undefined,
      imageUrl: user.imageUrl ?? undefined,
      subscriptionStatus: planTier === "free" ? "inactive" : "active",
      plan: persistedPlanForTier(planTier),
    }).catch((error) => {
      console.warn("[user-sync] failed to sync user", error);
    });
  }, [getOrCreateUser, isAuthLoaded, isLoaded, planTier, user]);

  return null;
}
