import {
	type AppErrorCode,
	type AppErrorPayload,
	appError,
	appErrorStatus,
	toAppErrorPayload,
} from "@repo/core/app-errors";
import { NextResponse } from "next/server";
import { classifyChatErrorCode } from "../chat/lib/error-classifier";

// JSON error response every client can read: `error` stays a plain string for
// older callers, the rest drives the friendly toast and Upgrade button.
export function apiErrorResponse(
	payload: AppErrorPayload,
	status = appErrorStatus(payload.code),
): Response {
	return NextResponse.json(
		{ ...payload, error: payload.message },
		{ status, headers: { "x-error-code": payload.code } },
	);
}

export function apiError(
	code: AppErrorCode,
	overrides: Partial<Omit<AppErrorPayload, "code">> = {},
): Response {
	return apiErrorResponse(appError(code, overrides));
}

// Safety-filter refusals read differently across providers.
const CONTENT_BLOCKED =
	/content.?policy|moderation|safety (system|filter)|flagged|violat|not allowed|prohibited|inappropriate|nsfw|sensitive content/i;

// Turns whatever a generation threw into a user-safe payload. Real details stay
// in the server logs; provider names and billing problems are never shown.
export function toGenerationError(error: unknown): AppErrorPayload {
	// Convex limits/credits come through as ConvexError data.
	if (error && typeof error === "object" && "data" in error) {
		const fromConvex = toAppErrorPayload((error as { data: unknown }).data);
		if (fromConvex) return fromConvex;
	}

	const text =
		error instanceof Error
			? `${error.name} ${error.message}`
			: typeof error === "string"
				? error
				: "";
	if (CONTENT_BLOCKED.test(text)) return appError("CONTENT_BLOCKED");

	switch (classifyChatErrorCode(error)) {
		case "rate_limited":
			return appError("RATE_LIMITED");
		case "timeout":
			return appError("TIMEOUT");
		case "input_too_long":
			return appError("INVALID_REQUEST", {
				message:
					"Your prompt is too long for this model. Shorten it and try again.",
			});
		// A 401/403 here comes from the provider key, not the user's session.
		case "unauthorized":
		case "ai_unavailable":
		case "model_unavailable":
			return appError("SERVICE_UNAVAILABLE");
		default:
			return appError("UNKNOWN");
	}
}
