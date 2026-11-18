import { describe, expect, test } from "bun:test";
import { applyMention, detectMention } from "./chat-mentions";

describe("chat mentions", () => {
	test("detects an @ query right before the caret", () => {
		expect(detectMention("ask @git", 8)).toEqual({ query: "git", start: 4 });
		expect(detectMention("email@x", 7)).toBeNull();
	});

	test("replaces the typed query with the provider", () => {
		const text = "ask @gi about issues";
		const mention = detectMention(text, 7);
		expect(mention).not.toBeNull();
		if (!mention) return;
		expect(applyMention(text, mention, "github")).toEqual({
			text: "ask @github about issues",
			caret: 12,
		});
	});
});
