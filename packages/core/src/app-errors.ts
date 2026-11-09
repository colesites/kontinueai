// One error format for every paid action (canvas, K-AI image tool, uploads…).
// Convex throws it as ConvexError data, API routes return it as JSON, and the
// client turns it into a toast with an "Upgrade" button when that would help.

import type { PlanTier } from "./plan-tier";

export type AppErrorCode =
	| "PLAN_REQUIRED" // feature not on this plan
	| "USAGE_LIMIT_REACHED" // monthly allowance for this feature used up
	| "CREDITS_EXHAUSTED" // AI usage / video credits used up
	| "INVALID_REQUEST" // bad prompt, model, size…
	| "UNAUTHORIZED" // signed out or account not verified
	| "RATE_LIMITED" // provider busy
	| "CONTENT_BLOCKED" // provider safety filter refused the prompt
	| "SERVICE_UNAVAILABLE" // provider/config problem on our side
	| "TIMEOUT"
	| "UNKNOWN";

export type AppErrorPayload = {
	code: AppErrorCode;
	// Short headline for the toast.
	title: string;
	// One or two sentences the user can act on.
	message: string;
	// Cheapest plan that unlocks the action, when upgrading is the fix.
	upgradeTo?: PlanTier;
	// Whether trying again unchanged can work.
	retryable: boolean;
};

const DEFAULTS: Record<AppErrorCode, Omit<AppErrorPayload, "code">> = {
	PLAN_REQUIRED: {
		title: "Upgrade required",
		message: "This feature isn't included in your current plan.",
		retryable: false,
	},
	USAGE_LIMIT_REACHED: {
		title: "Monthly limit reached",
		message:
			"You've used this month's allowance. It resets on the 1st, or you can upgrade for more.",
		retryable: false,
	},
	CREDITS_EXHAUSTED: {
		title: "Out of credits",
		message:
			"You don't have enough credits left this month. They reset on the 1st, or you can upgrade for more.",
		retryable: false,
	},
	INVALID_REQUEST: {
		title: "Check your request",
		message: "Something about this request isn't valid. Adjust it and try again.",
		retryable: false,
	},
	UNAUTHORIZED: {
		title: "Please sign in again",
		message: "We couldn't verify your account. Refresh the page and sign in.",
		retryable: false,
	},
	RATE_LIMITED: {
		title: "Busy right now",
		message: "This model is handling a lot of requests. Wait a few seconds and try again.",
		retryable: true,
	},
	CONTENT_BLOCKED: {
		title: "Prompt not allowed",
		message:
			"The model's safety filter declined this prompt. Try rewording it.",
		retryable: false,
	},
	SERVICE_UNAVAILABLE: {
		title: "Temporarily unavailable",
		message:
			"This model isn't available right now. Try again shortly or pick a different model.",
		retryable: true,
	},
	TIMEOUT: {
		title: "Took too long",
		message: "Generation timed out. Please try again.",
		retryable: true,
	},
	UNKNOWN: {
		title: "Something went wrong",
		message: "Generation failed on our end. Please try again.",
		retryable: true,
	},
};

// Older codes still sent by some routes and Convex functions.
const LEGACY_CODES: Record<string, AppErrorCode> = {
	CANVAS_PRO_REQUIRED: "PLAN_REQUIRED",
	PAID_MODEL_REQUIRED: "PLAN_REQUIRED",
	KODE_PRO_REQUIRED: "PLAN_REQUIRED",
	PAID_FILE_UPLOAD_REQUIRED: "PLAN_REQUIRED",
	AI_USAGE_CREDITS_EXHAUSTED: "CREDITS_EXHAUSTED",
};

export function normalizeAppErrorCode(code: unknown): AppErrorCode | null {
	if (typeof code !== "string") return null;
	if (code in DEFAULTS) return code as AppErrorCode;
	return LEGACY_CODES[code] ?? null;
}

export function appError(
	code: AppErrorCode,
	overrides: Partial<Omit<AppErrorPayload, "code">> = {},
): AppErrorPayload {
	return { code, ...DEFAULTS[code], ...overrides };
}

// HTTP status that matches each code.
export function appErrorStatus(code: AppErrorCode): number {
	switch (code) {
		case "PLAN_REQUIRED":
			return 403;
		case "USAGE_LIMIT_REACHED":
		case "CREDITS_EXHAUSTED":
			return 402;
		case "INVALID_REQUEST":
		case "CONTENT_BLOCKED":
			return 400;
		case "UNAUTHORIZED":
			return 401;
		case "RATE_LIMITED":
			return 429;
		case "TIMEOUT":
			return 504;
		case "SERVICE_UNAVAILABLE":
			return 503;
		default:
			return 500;
	}
}

// Accepts anything shaped like a payload (ConvexError data, JSON body) and
// fills in missing fields. Returns null when it isn't one of ours.
export function toAppErrorPayload(value: unknown): AppErrorPayload | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	const code = normalizeAppErrorCode(v.code);
	if (!code) return null;
	const message =
		typeof v.message === "string"
			? v.message
			: typeof v.error === "string"
				? v.error
				: undefined;
	return appError(code, {
		...(typeof v.title === "string" ? { title: v.title } : {}),
		...(message ? { message } : {}),
		...(typeof v.upgradeTo === "string"
			? { upgradeTo: v.upgradeTo as PlanTier }
			: {}),
		...(typeof v.retryable === "boolean" ? { retryable: v.retryable } : {}),
	});
}
