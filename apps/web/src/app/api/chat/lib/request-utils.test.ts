import { describe, expect, test } from "bun:test";
import {
	createInputTooLongResponse,
	estimateUiMessageTokens,
	limitMessagesToInputTokens,
} from "./request-utils";

describe("createInputTooLongResponse", () => {
	test("returns a 400 JSON response with a friendly message", async () => {
		const response = createInputTooLongResponse({
			tierLabel: "Free users",
			maxInputTokens: 2_000,
			estimatedInputTokens: 2_800,
		});
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload).toEqual({
			code: "INPUT_TOO_LONG",
			error:
				"The message you just sent is too long for your current plan. Please shorten it and try again.",
			details: {
				tier: "Free users",
				maxInputTokens: 2_000,
				estimatedInputTokens: 2_800,
			},
		});
	});
});

describe("limitMessagesToInputTokens", () => {
	test("keeps the newest contiguous turns so an old import cannot block a reply", () => {
		const messages = [
			{
				id: "imported",
				role: "assistant" as const,
				parts: [{ type: "text" as const, text: "a".repeat(8_000) }],
			},
			{
				id: "new-message",
				role: "user" as const,
				parts: [{ type: "text" as const, text: "What should I do next?" }],
			},
		];

		const limited = limitMessagesToInputTokens(messages, 100);

		expect(limited.map((message) => message.id)).toEqual(["new-message"]);
		expect(estimateUiMessageTokens(limited)).toBeLessThanOrEqual(100);
	});

	test("retains an oversized latest message so it can be rejected clearly", () => {
		const messages = [
			{
				id: "new-message",
				role: "user" as const,
				parts: [{ type: "text" as const, text: "a".repeat(1_000) }],
			},
		];

		const limited = limitMessagesToInputTokens(messages, 100);

		expect(limited).toEqual(messages);
		expect(estimateUiMessageTokens(limited)).toBeGreaterThan(100);
	});
});
