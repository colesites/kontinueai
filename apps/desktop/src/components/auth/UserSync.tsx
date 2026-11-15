import { useAuth, useUser } from "@clerk/clerk-react";
import { persistedPlanForTier, type PlanTier } from "@repo/core/plan-tier";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";

import { api } from "@/lib/convex-api";

type SyncResult = { key: string; error: boolean };

/** Synchronize the account even while the startup screen is visible. */
export function useUserSync(planTier: PlanTier | null) {
  const { user, isLoaded } = useUser();
  const { isLoaded: isAuthLoaded } = useAuth();
  const getOrCreateUser = useMutation(api.users.getOrCreateUser);
  const [result, setResult] = useState<SyncResult | null>(null);
  const userId = user?.id;
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName ?? undefined;
  const imageUrl = user?.imageUrl ?? undefined;
  const key = isLoaded && isAuthLoaded && userId && planTier !== null
    ? JSON.stringify([userId, email, name, imageUrl, planTier])
    : null;

  useEffect(() => {
    if (!key || planTier === null) return;
    let active = true;
    void getOrCreateUser({
      email,
      name,
      imageUrl,
      subscriptionStatus: planTier === "free" ? "inactive" : "active",
      plan: persistedPlanForTier(planTier),
    }).then(() => {
      if (active) setResult({ key, error: false });
    }).catch((error) => {
      console.warn("[user-sync] failed to sync user", error);
      if (active) setResult({ key, error: true });
    });
    return () => { active = false; };
  }, [email, getOrCreateUser, imageUrl, key, name, planTier]);

  return {
    synced: key !== null && result?.key === key && !result.error,
    failed: key !== null && result?.key === key && result.error,
  };
}
