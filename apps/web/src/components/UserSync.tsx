"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@repo/convex/convex/_generated/api";
import { persistedPlanForTier } from "@repo/core/plan-tier";
import { usePlanTier } from "../lib/use-plan-tier";

/**
 * A lightweight component that ensures the current Clerk user
 * is synced to the Convex database.
 */
export function UserSync() {
  const { user, isLoaded } = useUser();
  const { isLoaded: isAuthLoaded } = useAuth();
  const getOrCreateUser = useMutation(api.users.getOrCreateUser);
  const planTier = usePlanTier();

  useEffect(() => {
    if (!isLoaded || !isAuthLoaded || !user) {
      return;
    }

    void getOrCreateUser({
      clerkUserId: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? "",
      name: user.fullName ?? undefined,
      imageUrl: user.imageUrl ?? undefined,
      subscriptionStatus: planTier === "free" ? "inactive" : "active",
      plan: persistedPlanForTier(planTier),
    });
  }, [getOrCreateUser, isAuthLoaded, isLoaded, planTier, user]);

  return null;
}
