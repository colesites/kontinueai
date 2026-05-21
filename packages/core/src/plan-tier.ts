type Entitlement = { key?: string | null; name?: string | null };

type BillingMetadata = {
  plan?: string | null;
  subscriptionStatus?: string | null;
};

export type BillingUserLike = {
  entitlements?: Entitlement[] | null;
  publicMetadata?: BillingMetadata | null;
  unsafeMetadata?: BillingMetadata | null;
};

export type PlanTier = "free" | "starter" | "pro";
export const STARTER_PLAN_ID = "starter_plan";
export const PRO_PLAN_ID = "pro_plan";

type PlanResolutionInput = {
  hasStarterPlan?: boolean;
  hasProPlan?: boolean;
  billingUser?: BillingUserLike | null;
  persistedPlan?: string | null;
};

const STARTER_PLAN_IDS = new Set([
  "starter",
  STARTER_PLAN_ID,
  "starter-plan",
  // Legacy persisted value before Starter tier existed.
  "pro",
]);

const PRO_PLAN_IDS = new Set([
  PRO_PLAN_ID,
  "pro-plan",
  "pro_plus",
  "proplus",
  "pro_v2",
]);

function normalizePlanLike(value?: string | null): string {
  return value?.toLowerCase().trim() ?? "";
}

function parsePlanTierFromValue(value?: string | null): PlanTier | null {
  const normalized = normalizePlanLike(value);
  if (!normalized) return null;
  if (PRO_PLAN_IDS.has(normalized)) return "pro";
  if (STARTER_PLAN_IDS.has(normalized)) return "starter";
  return null;
}

function parsePlanTierFromEntitlements(
  entitlements?: Entitlement[] | null,
): PlanTier | null {
  let detectedTier: PlanTier | null = null;
  for (const entitlement of entitlements ?? []) {
    const keyTier = parsePlanTierFromValue(entitlement.key);
    const nameTier = parsePlanTierFromValue(entitlement.name);
    const tier = keyTier ?? nameTier;
    if (!tier) continue;
    if (tier === "pro") return "pro";
    detectedTier = "starter";
  }
  return detectedTier;
}

export function resolvePlanTierFromBillingSignals({
  hasStarterPlan = false,
  hasProPlan = false,
  billingUser,
  persistedPlan,
}: PlanResolutionInput): PlanTier {
  if (hasProPlan) return "pro";
  if (hasStarterPlan) return "starter";

  const planFromMetadata =
    billingUser?.publicMetadata?.plan ?? billingUser?.unsafeMetadata?.plan;
  const metadataTier = parsePlanTierFromValue(planFromMetadata);
  if (metadataTier) return metadataTier;

  const entitlementTier = parsePlanTierFromEntitlements(
    billingUser?.entitlements,
  );
  if (entitlementTier) return entitlementTier;

  const subscriptionStatusFromMetadata = normalizePlanLike(
    billingUser?.publicMetadata?.subscriptionStatus ??
      billingUser?.unsafeMetadata?.subscriptionStatus,
  );
  if (subscriptionStatusFromMetadata === "active") {
    const persistedTier = parsePlanTierFromValue(persistedPlan);
    return persistedTier ?? "starter";
  }

  const persistedTier = parsePlanTierFromValue(persistedPlan);
  return persistedTier ?? "free";
}

export function isPaidTier(tier: PlanTier): boolean {
  return tier !== "free";
}

export function planLabel(tier: PlanTier): string {
  if (tier === "starter") return "Starter";
  if (tier === "pro") return "Pro";
  return "Free";
}

export function persistedPlanForTier(tier: PlanTier): string {
  if (tier === "starter") return STARTER_PLAN_ID;
  if (tier === "pro") return PRO_PLAN_ID;
  return "free";
}

export function isProFromBillingSignals({
  hasStarterPlan = false,
  hasProPlan = false,
  billingUser,
}: Omit<PlanResolutionInput, "persistedPlan">): boolean {
  return isPaidTier(
    resolvePlanTierFromBillingSignals({
      hasStarterPlan,
      hasProPlan,
      billingUser,
    }),
  );
}

export function isProUser({
  hasStarterPlan = false,
  hasProPlan = false,
  billingUser,
  persistedPlan,
}: PlanResolutionInput): boolean {
  return isPaidTier(
    resolvePlanTierFromBillingSignals({
      hasStarterPlan,
      hasProPlan,
      billingUser,
      persistedPlan,
    }),
  );
}
