import { describe, expect, test } from "bun:test";
import {
	getChatErrorKind,
	getChatErrorToast,
	toChatRequestBody,
	trimMessagesToRetryTarget,
} from "./chat-request";

describe("toChatRequestBody", () => {
	test("carries every field web and mobile send to /api/chat", () => {
		const body = toChatRequestBody(
			{
				selectedModel: "openai/gpt-5.4-mini",
				webSearchEnabled: true,
				reasoningEnabled: false,
				imageAspectRatio: "16:9",
				imageSize: null,
			},
			"chat_1",
		);
		expect(body).toMatchObject({
			chatId: "chat_1",
			model: "openai/gpt-5.4-mini",
			webSearchEnabled: true,
			reasoningEnabled: false,
			imageAspectRatio: "16:9",
			imageSize: null,
			agentId: null,
		});
		expect("userTimezone" in body).toBe(true);
	});
});

describe("trimMessagesToRetryTarget", () => {
	const messages = [
		{ id: "u1", role: "user" },
		{ id: "a1", role: "assistant" },
		{ id: "u2", role: "user" },
		{ id: "a2", role: "assistant" },
	];

	test("keeps everything up to the user turn that produced the retried reply", () => {
		expect(trimMessagesToRetryTarget(messages, "a1").map((m) => m.id)).toEqual([
			"u1",
		]);
		expect(trimMessagesToRetryTarget(messages, "a2").map((m) => m.id)).toEqual([
			"u1",
			"a1",
			"u2",
		]);
	});
});

describe("chat errors", () => {
	test("classifies so a client can offer the right fix", () => {
		expect(getChatErrorKind("Pro plan required for this model")).toBe("plan");
		expect(getChatErrorKind("Too many requests")).toBe("busy");
		expect(getChatErrorKind("no_providers_available")).toBe("model");
		expect(getChatErrorKind("totally unexpected")).toBe("unknown");
	});

	test("keeps the toast copy shape web asserts on", () => {
		expect(getChatErrorToast("Unauthorized")).toEqual({
			title: "You're not signed in.",
			description: "Please refresh and sign in again.",
		});
	});
});
