export type PersistedPlanTier = "free" | "starter" | "pro";

const STARTER_PERSISTED_IDS = new Set([
  "starter",
  "starter_plan",
  "starter-plan",
  // Legacy value before Starter was introduced.
  "pro",
]);

const PRO_PERSISTED_IDS = new Set([
  "pro_plan",
  "pro-plan",
  "pro_plus",
  "proplus",
  "pro_v2",
]);

function normalizePlan(plan?: string | null): string {
  return plan?.toLowerCase().trim() ?? "";
}

export function getPersistedPlanTier(plan?: string | null): PersistedPlanTier {
  const normalized = normalizePlan(plan);
  if (!normalized || normalized === "free") return "free";
  if (PRO_PERSISTED_IDS.has(normalized)) return "pro";
  if (STARTER_PERSISTED_IDS.has(normalized)) return "starter";
  return "free";
}

export function isPersistedPaidPlan(plan?: string | null): boolean {
  return getPersistedPlanTier(plan) !== "free";
}
