import { describe, expect, test } from "bun:test";
import { appError, toAppErrorPayload } from "@repo/core/app-errors";
import { toGenerationError } from "../app/api/lib/api-error";
import { readApiError } from "../lib/app-error-toast";

describe("toAppErrorPayload", () => {
	test("maps legacy codes and keeps the message", () => {
		const p = toAppErrorPayload({
			code: "AI_USAGE_CREDITS_EXHAUSTED",
			message: "Your Free AI usage credits are exhausted for this month.",
		});
		expect(p?.code).toBe("CREDITS_EXHAUSTED");
		expect(p?.message).toContain("exhausted");
	});
	test("ignores foreign shapes", () => {
		expect(toAppErrorPayload({ code: "SOMETHING_ELSE" })).toBeNull();
		expect(toAppErrorPayload("nope")).toBeNull();
	});
});

describe("toGenerationError", () => {
	test("passes Convex limit errors through", () => {
		const err = Object.assign(new Error("ConvexError"), {
			data: appError("USAGE_LIMIT_REACHED", { upgradeTo: "plus" }),
		});
		const p = toGenerationError(err);
		expect(p.code).toBe("USAGE_LIMIT_REACHED");
		expect(p.upgradeTo).toBe("plus");
	});
	test("hides provider auth and billing problems", () => {
		expect(
			toGenerationError({ statusCode: 401, message: "Authentication failed" })
				.code,
		).toBe("SERVICE_UNAVAILABLE");
		expect(toGenerationError(new Error("insufficient_credits")).code).toBe(
			"SERVICE_UNAVAILABLE",
		);
	});
	test("recognises safety refusals and rate limits", () => {
		expect(
			toGenerationError(new Error("Request rejected by content policy")).code,
		).toBe("CONTENT_BLOCKED");
		expect(
			toGenerationError({ statusCode: 429, message: "slow down" }).code,
		).toBe("RATE_LIMITED");
	});
});

describe("readApiError", () => {
	test("reads the JSON format", async () => {
		const res = new Response(
			JSON.stringify({
				...appError("PLAN_REQUIRED", { upgradeTo: "pro" }),
				error: "x",
			}),
			{ status: 403 },
		);
		const p = await readApiError(res);
		expect(p.code).toBe("PLAN_REQUIRED");
		expect(p.upgradeTo).toBe("pro");
	});
	test("reads old plain-text plan denials without crashing", async () => {
		const res = new Response("Canvas is available on Pro and Max.", {
			status: 403,
			headers: { "x-error-code": "CANVAS_PRO_REQUIRED" },
		});
		const p = await readApiError(res);
		expect(p.code).toBe("PLAN_REQUIRED");
		expect(p.message).toBe("Canvas is available on Pro and Max.");
	});
	test("falls back on status for empty bodies", async () => {
		expect((await readApiError(new Response("", { status: 500 }))).code).toBe(
			"UNKNOWN",
		);
	});
});
