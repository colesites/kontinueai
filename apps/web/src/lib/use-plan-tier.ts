"use client";

import { useAuth, useUser } from "@clerk/nextjs";
// import { api } from "@repo/convex/convex/_generated/api";
import { api } from "@repo/convex/convex/_generated/api";
import {
	type BillingUserLike,
	isPaidTier,
	MAX_PLAN_ID,
	PLUS_PLAN_ID,
	type PlanTier,
	PRO_PLAN_ID,
	resolvePlanTierFromBillingSignals,
	STARTER_PLAN_ID,
} from "@repo/core/plan-tier";
import { useQuery } from "convex/react";

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
	const hasPlusPlan =
		isAuthLoaded && typeof has === "function"
			? has({ plan: PLUS_PLAN_ID })
			: false;
	const hasMaxPlan =
		isAuthLoaded && typeof has === "function"
			? has({ plan: MAX_PLAN_ID })
			: false;

	return resolvePlanTierFromBillingSignals({
		hasStarterPlan,
		hasPlusPlan,
		hasProPlan,
		hasMaxPlan,
		billingUser: user as unknown as BillingUserLike | null | undefined,
		persistedPlan: currentUser?.plan,
	});
}

export function useIsProPlan(): boolean {
	return isPaidTier(usePlanTier());
}
