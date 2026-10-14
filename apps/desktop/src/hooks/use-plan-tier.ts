import { useAuth, useUser } from "@clerk/clerk-react";
import {
	isPaidTier,
	MAX_PLAN_ID,
	PLUS_PLAN_ID,
	PRO_PLAN_ID,
	resolvePlanTierFromBillingSignals,
	STARTER_PLAN_ID,
	type BillingUserLike,
	type PlanTier,
} from "@repo/core/plan-tier";
import { useQuery } from "convex/react";

import { api } from "@/lib/convex-api";

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
