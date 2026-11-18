// Client-side half of the app error format: turns a failed fetch, a
// ConvexError or a network failure into an AppErrorPayload. Shared by the web
// toast and the Expo toast so both clients read errors the same way.

import {
	type AppErrorPayload,
	appError,
	normalizeAppErrorCode,
	toAppErrorPayload,
} from "./app-errors";

// Thrown inside client flows so one catch can show the right toast.
export class AppError extends Error {
	constructor(readonly payload: AppErrorPayload) {
		super(payload.message);
		this.name = "AppError";
	}
}

function fromStatus(status: number, text?: string): AppErrorPayload {
	const message = text?.trim() && text.length < 300 ? text.trim() : undefined;
	if (status === 401) return appError("UNAUTHORIZED");
	if (status === 403)
		return appError("PLAN_REQUIRED", message ? { message } : {});
	if (status === 402)
		return appError("USAGE_LIMIT_REACHED", message ? { message } : {});
	if (status === 429) return appError("RATE_LIMITED");
	if (status === 504) return appError("TIMEOUT");
	if (status >= 400 && status < 500 && message) {
		return appError("INVALID_REQUEST", { message });
	}
	return appError("UNKNOWN");
}

// Reads a failed fetch response, whatever shape the body is in. Never throws.
export async function readApiError(
	response: Response,
): Promise<AppErrorPayload> {
	const raw = await response.text().catch(() => "");
	let body: unknown = null;
	try {
		body = raw ? JSON.parse(raw) : null;
	} catch {
		body = null;
	}
	const parsed = toAppErrorPayload(body);
	if (parsed) return parsed;

	// Older routes: plain-text body plus an `x-error-code` header.
	const headerCode = normalizeAppErrorCode(
		response.headers.get("x-error-code"),
	);
	const text =
		body &&
		typeof body === "object" &&
		typeof (body as { error?: unknown }).error === "string"
			? (body as { error: string }).error
			: raw;
	if (headerCode) {
		return appError(headerCode, text?.trim() ? { message: text.trim() } : {});
	}
	return fromStatus(response.status, text);
}

// Turns anything caught on the client (AppError, ConvexError, network error)
// into a payload.
export function toClientAppError(error: unknown): AppErrorPayload {
	if (error instanceof AppError) return error.payload;
	if (error && typeof error === "object" && "data" in error) {
		const fromConvex = toAppErrorPayload((error as { data: unknown }).data);
		if (fromConvex) return fromConvex;
	}
	if (error instanceof TypeError) {
		return appError("UNKNOWN", {
			title: "Connection problem",
			message:
				"We couldn't reach the server. Check your connection and try again.",
		});
	}
	return appError("UNKNOWN");
}
