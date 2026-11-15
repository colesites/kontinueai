import { PLAN_TIERS, type PlanTier } from "@repo/core/plan-tier";

// These values are presentation preferences, not credentials or authorization.
// Scope them to the signed-in Clerk account; never use them to sync billing.
function key(userId: string, field: string) {
  return `kontinue:offline:v1:${encodeURIComponent(userId)}:${field}`;
}

export function readOfflineValue(userId: string | null | undefined, field: string): string | null {
  if (!userId) return null;
  try { return localStorage.getItem(key(userId, field)); } catch { return null; }
}

export function writeOfflineValue(userId: string | null | undefined, field: string, value: string): void {
  if (!userId) return;
  try { localStorage.setItem(key(userId, field), value); } catch { /* Storage may be unavailable. */ }
}

export function readOfflinePlan(userId: string | null | undefined): PlanTier | null {
  const value = readOfflineValue(userId, "plan");
  return PLAN_TIERS.find((tier) => tier === value) ?? null;
}