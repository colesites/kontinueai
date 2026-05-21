import { clerkClient } from "@clerk/nextjs/server";
import {
  PRO_PLAN_ID,
  resolvePlanTierFromBillingSignals,
  STARTER_PLAN_ID,
  type BillingUserLike,
  type PlanTier,
} from "@repo/core/plan-tier";

export async function getUserPlanTier(
  clerkUserId: string,
  hasPlan?: (args: { plan: string }) => boolean,
): Promise<PlanTier> {
  const hasStarterPlan =
    typeof hasPlan === "function" ? hasPlan({ plan: STARTER_PLAN_ID }) : false;
  const hasProPlan =
    typeof hasPlan === "function" ? hasPlan({ plan: PRO_PLAN_ID }) : false;

  if (hasProPlan) return "pro";
  if (hasStarterPlan) return "starter";

  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);

  return resolvePlanTierFromBillingSignals({
    hasStarterPlan,
    hasProPlan,
    billingUser: user as unknown as BillingUserLike,
  });
}

export function getTokenLimitsByTier(options: {
  planTier: PlanTier;
  isPremiumModel: boolean;
}): { maxInputTokens: number; maxOutputTokens: number; tierLabel: string } {
  const { planTier, isPremiumModel } = options;

  if (planTier === "pro") {
    return isPremiumModel
      ? {
          maxInputTokens: 1400,
          maxOutputTokens: 1400,
          tierLabel: "Pro users on premium models",
        }
      : {
          maxInputTokens: 900,
          maxOutputTokens: 900,
          tierLabel: "Pro users on standard models",
        };
  }

  if (planTier === "starter") {
    return isPremiumModel
      ? {
          maxInputTokens: 100,
          maxOutputTokens: 500,
          tierLabel: "Starter users on premium models",
        }
      : {
          maxInputTokens: 200,
          maxOutputTokens: 500,
          tierLabel: "Starter users on standard models",
        };
  }

  return {
    maxInputTokens: 100,
    maxOutputTokens: 200,
    tierLabel: "Free users",
  };
}
