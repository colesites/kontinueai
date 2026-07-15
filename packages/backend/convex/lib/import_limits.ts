import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import type { PersistedPlanTier } from "./plan";

export const FREE_MONTHLY_AUTOMATIC_IMPORT_LIMIT =
	PLAN_DEFINITIONS.free.chatImports;
export const STARTER_MONTHLY_AUTOMATIC_IMPORT_LIMIT =
	PLAN_DEFINITIONS.starter.chatImports;

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
	return PLAN_DEFINITIONS[planTier].chatImports;
}
