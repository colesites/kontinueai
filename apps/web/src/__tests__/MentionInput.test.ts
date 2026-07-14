import { describe, expect, test } from "bun:test";
import { normalizeEmptyContentEditable } from "../features/chat/lib/mention-input-dom";

describe("MentionInput", () => {
	test("removes the browser placeholder br after deleting all text", () => {
		const input = document.createElement("div");
		input.innerHTML = "<br>";

		expect(normalizeEmptyContentEditable(input)).toBe(true);
		expect(input.innerHTML).toBe("");
	});

	test("preserves actual text and mention chips", () => {
		const textInput = document.createElement("div");
		textInput.textContent = "Hello";
		expect(normalizeEmptyContentEditable(textInput)).toBe(false);
		expect(textInput.textContent).toBe("Hello");

		const mentionInput = document.createElement("div");
		mentionInput.innerHTML = '<span data-provider="github"></span>';
		expect(normalizeEmptyContentEditable(mentionInput)).toBe(false);
		expect(mentionInput.firstElementChild).not.toBeNull();
	});
});
