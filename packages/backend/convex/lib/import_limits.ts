import type { PersistedPlanTier } from "./plan";

export const FREE_MONTHLY_AUTOMATIC_IMPORT_LIMIT = 10;
export const STARTER_MONTHLY_AUTOMATIC_IMPORT_LIMIT = 1000;

export function getUtcMonthStartMs(timestampMs: number): number {
  const date = new Date(timestampMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export function getUtcMonthRange(timestampMs: number): {
  monthStartMs: number;
  monthEndMs: number;
} {
  const date = new Date(timestampMs);
  const monthStartMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const monthEndMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return { monthStartMs, monthEndMs };
}

export function getMonthlyAutomaticImportLimit(
  planTier: PersistedPlanTier,
): number | null {
  if (planTier === "free") return FREE_MONTHLY_AUTOMATIC_IMPORT_LIMIT;
  if (planTier === "starter") return STARTER_MONTHLY_AUTOMATIC_IMPORT_LIMIT;
  return null;
}
