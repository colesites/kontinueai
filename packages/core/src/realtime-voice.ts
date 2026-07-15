import type { PlanTier } from "./plan-tier";

export const PRO_REALTIME_MODEL_ID = "openai/gpt-realtime-1.5" as const;
export const MAX_REALTIME_MODEL_ID = "openai/gpt-realtime-2.1" as const;

export const REALTIME_VOICE_LIMITS = {
	free: { monthlySeconds: 0, maxSessionSeconds: 0 },
	starter: { monthlySeconds: 0, maxSessionSeconds: 0 },
	plus: { monthlySeconds: 0, maxSessionSeconds: 0 },
	pro: { monthlySeconds: 30 * 60, maxSessionSeconds: 15 * 60 },
	max: { monthlySeconds: 120 * 60, maxSessionSeconds: 30 * 60 },
} as const satisfies Record<
	PlanTier,
	{ monthlySeconds: number; maxSessionSeconds: number }
>;

export type RealtimeVoiceModelId =
	| typeof PRO_REALTIME_MODEL_ID
	| typeof MAX_REALTIME_MODEL_ID;

export function getRealtimeVoiceModel(
	tier: PlanTier,
): RealtimeVoiceModelId | null {
	if (tier === "max") return MAX_REALTIME_MODEL_ID;
	if (tier === "pro") return PRO_REALTIME_MODEL_ID;
	return null;
}

export function getUtcMonthKey(nowMs = Date.now()): string {
	const date = new Date(nowMs);
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
