import { describe, expect, test } from "bun:test";
import { normalizeClaudeMessageContent } from "./claude";

describe("normalizeClaudeMessageContent", () => {
	test("preserves text and a Claude artifact from content blocks", () => {
		const content = normalizeClaudeMessageContent([
			{ type: "text", text: "I made the requested page." },
			{
				type: "tool_use",
				name: "artifacts",
				input: {
					title: "Landing page",
					type: "text/html",
					content: "<main><h1>Hello</h1></main>",
				},
			},
		]);

		expect(content).toContain("I made the requested page.");
		expect(content).toContain("### Claude Artifact: Landing page");
		expect(content).toContain("```html");
		expect(content).toContain("<main><h1>Hello</h1></main>");
	});

	test("does not stringify unrelated structured blocks", () => {
		expect(
			normalizeClaudeMessageContent({
				type: "tool_use",
				name: "web_search",
				input: { content: "internal search payload" },
			}),
		).toBe("");
	});

	test("preserves newer create_file artifact blocks", () => {
		const content = normalizeClaudeMessageContent({
			type: "tool_use",
			name: "create_file",
			input: {
				filename: "diagram.svg",
				content: '<svg viewBox="0 0 10 10"><circle r="4" /></svg>',
			},
		});

		expect(content).toContain("### Claude Artifact: diagram.svg");
		expect(content).toContain("```svg");
		expect(content).toContain("<circle");
	});
});
