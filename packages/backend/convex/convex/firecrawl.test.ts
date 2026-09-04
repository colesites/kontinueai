import { describe, expect, test } from "bun:test";
import {
	buildFirecrawlScrapeRequest,
	detachTrailingAttachmentLines,
	parseNormalizedTranscript,
	shrinkImageUrlsForNormalizer,
	splitEmbeddedUserTurns,
} from "./firecrawl";

describe("buildFirecrawlScrapeRequest", () => {
	test("keeps Claude's separate artifact panel in the rendered scrape", () => {
		expect(
			buildFirecrawlScrapeRequest("https://claude.ai/share/example"),
		).toEqual({
			url: "https://claude.ai/share/example",
			formats: ["markdown"],
			onlyMainContent: false,
			waitFor: 8_000,
		});
	});

	test("keeps main-content filtering for providers without a side artifact panel", () => {
		expect(
			buildFirecrawlScrapeRequest("https://chatgpt.com/share/example"),
		).toEqual({
			url: "https://chatgpt.com/share/example",
			formats: ["markdown"],
			onlyMainContent: true,
			waitFor: 5_000,
		});
	});
});

describe("parseNormalizedTranscript", () => {
	test("parses [USER]/[ASSISTANT] format correctly", () => {
		const input = `[USER]:
Hello, how are you?

[ASSISTANT]:
I am doing well! How can I help you today?

[USER]:
Write me a poem.`;

		const { messages } = parseNormalizedTranscript(input);

		expect(messages).toHaveLength(3);

		expect(messages[0]?.role).toBe("user");
		expect(messages[0]?.content).toBe("Hello, how are you?");

		expect(messages[1]?.role).toBe("assistant");
		expect(messages[1]?.content).toBe(
			"I am doing well! How can I help you today?",
		);

		expect(messages[2]?.role).toBe("user");
		expect(messages[2]?.content).toBe("Write me a poem.");
	});

	test("handles code blocks inside messages", () => {
		const input = `[USER]:
Write some code

[ASSISTANT]:
Here is your code:
\`\`\`javascript
console.log("Hello");
\`\`\`
Hope it helps!`;

		const { messages } = parseNormalizedTranscript(input);

		expect(messages).toHaveLength(2);
		expect(messages[1]?.role).toBe("assistant");
		expect(messages[1]?.content).toContain("```javascript");
		expect(messages[1]?.content).toContain('console.log("Hello");');
	});

	test("preserves a normalized Claude artifact inside its assistant message", () => {
		const input = `[USER]:
Build a small counter.

[ASSISTANT]:
I created the counter.

### Claude Artifact: Counter

\`\`\`html
<button id="counter">0</button>
<script>counter.onclick = () => counter.textContent++;</script>
\`\`\``;

		const { messages } = parseNormalizedTranscript(input);

		expect(messages).toHaveLength(2);
		expect(messages[1]?.content).toContain("### Claude Artifact: Counter");
		expect(messages[1]?.content).toContain('<button id="counter">0</button>');
	});

	test("does not split on [USER]/[ASSISTANT] markers inside code blocks", () => {
		const input = `[USER]:
Show me an example

[ASSISTANT]:
Use this format:
\`\`\`md
[USER]:
This is part of code, not a new turn
\`\`\`
Done.`;

		const { messages } = parseNormalizedTranscript(input);

		expect(messages).toHaveLength(2);
		expect(messages[1]?.role).toBe("assistant");
		expect(messages[1]?.content).toContain("[USER]:");
		expect(messages[1]?.content).toContain("not a new turn");
	});

	test("handles robustness: spacing and newlines", () => {
		const input = `
[USER]:
  Trim me please  

[ASSISTANT]:
Okay!
`;
		const { messages } = parseNormalizedTranscript(input);
		expect(messages).toHaveLength(2);
		expect(messages[0]?.content).toBe("Trim me please");
		expect(messages[1]?.content).toBe("Okay!");
	});

	test("ignores broken or empty markers", () => {
		const input = `
Header text ignoring...
[USER]:
Valid content
[BROKEN]:
Ignored
`;
		// The parser expects strict [USER]:\n or [ASSISTANT]:\n
		// If there is extra text at the top, it should be ignored if it's before the first marker.
		const { messages } = parseNormalizedTranscript(input);
		expect(messages).toHaveLength(1);
		expect(messages[0]?.content).toBe("Valid content\n[BROKEN]:\nIgnored");
	});
});

describe("splitEmbeddedUserTurns", () => {
	test("pulls an attachment-marked user turn out of an assistant message", () => {
		const messages = splitEmbeddedUserTurns([
			{
				role: "assistant",
				content: [
					"That's the bigger story.",
					"Uploaded an image",
					"I have an investor list in notion, can you help me with their contacts?",
					"Yes. I can work directly from the investors in your Notion screenshot.",
				].join("\n"),
			},
		]);

		expect(messages).toHaveLength(3);
		expect(messages[0]).toEqual({
			role: "assistant",
			content: "That's the bigger story.",
		});
		expect(messages[1]).toEqual({
			role: "user",
			content:
				"Uploaded an image\nI have an investor list in notion, can you help me with their contacts?",
		});
		expect(messages[2]?.role).toBe("assistant");
	});

	test("splits a bare embedded question when the assistant visibly resumes", () => {
		const messages = splitEmbeddedUserTurns([
			{
				role: "assistant",
				content: [
					"Here is the full breakdown of the pricing tiers.",
					"Can you put that in a table?",
					"Sure, here it is as a table.",
				].join("\n"),
			},
		]);

		expect(messages.map((message) => message.role)).toEqual([
			"assistant",
			"user",
			"assistant",
		]);
		expect(messages[1]?.content).toBe("Can you put that in a table?");
	});

	test("leaves a rhetorical question alone when no reply follows it", () => {
		const original = [
			{
				role: "assistant" as const,
				content: [
					"There are a few angles worth weighing here.",
					"What makes users stay?",
					"Retention is driven by persistent context more than raw speed.",
				].join("\n"),
			},
		];

		expect(splitEmbeddedUserTurns(original)).toEqual(original);
	});

	test("ignores questions inside code blocks and lists", () => {
		const original = [
			{
				role: "assistant" as const,
				content: [
					"Try this snippet:",
					"```js",
					"// Can you handle this case?",
					"Yes.answer()",
					"```",
					"- What is your moat?",
					"Here's why that matters.",
				].join("\n"),
			},
		];

		expect(splitEmbeddedUserTurns(original)).toEqual(original);
	});

	test("leaves user messages untouched", () => {
		const original = [
			{ role: "user" as const, content: "Can you help me? Yes I need it." },
		];
		expect(splitEmbeddedUserTurns(original)).toEqual(original);
	});
});

describe("detachTrailingAttachmentLines", () => {
	test("hands an attachment label emitted before the role header to the next turn", () => {
		const parts = ["Here is the analysis.", "", "Uploaded an image"];
		expect(detachTrailingAttachmentLines(parts)).toEqual(["Uploaded an image"]);
		expect(parts).toEqual(["Here is the analysis."]);
	});

	test("carries a markdown image and a bare filename forward", () => {
		const parts = [
			"That's the summary.",
			"![screenshot](https://cdn.example.com/a.png)",
			"investors.pdf",
		];
		expect(detachTrailingAttachmentLines(parts)).toEqual([
			"![screenshot](https://cdn.example.com/a.png)",
			"investors.pdf",
		]);
		expect(parts).toEqual(["That's the summary."]);
	});

	test("keeps an attachment-only message with its own speaker", () => {
		const parts = ["Uploaded an image"];
		expect(detachTrailingAttachmentLines(parts)).toEqual([]);
		expect(parts).toEqual(["Uploaded an image"]);
	});

	test("leaves attachments that are not at the end of the turn", () => {
		const parts = ["Uploaded an image", "and here is what I make of it."];
		expect(detachTrailingAttachmentLines(parts)).toEqual([]);
	});

	test("ignores an image line inside an unterminated code block", () => {
		const parts = ["Example:", "```md", "![diagram](a.png)"];
		expect(detachTrailingAttachmentLines(parts)).toEqual([]);
	});
});

describe("attachment placement across providers", () => {
	test("[USER]/[ASSISTANT] transcript keeps the upload with the user turn", () => {
		const { messages } = parseNormalizedTranscript(
			[
				"[ASSISTANT]:",
				"That's the bigger story.",
				"Uploaded an image",
				"[USER]:",
				"I have an investor list in notion, can you help me with their contacts?",
				"[ASSISTANT]:",
				"Yes. I can work directly from your Notion screenshot.",
			].join("\n"),
		);

		expect(messages).toHaveLength(3);
		expect(messages[0]?.content).toBe("That's the bigger story.");
		expect(messages[1]).toEqual({
			role: "user",
			content:
				"Uploaded an image\nI have an investor list in notion, can you help me with their contacts?",
		});
	});
});

describe("shrinkImageUrlsForNormalizer", () => {
	test("replaces a base64 data URI with a token and restores it", () => {
		const markdown =
			"Uploaded an image\n\n![Uploaded image](data:image/png;base64,AAAABBBBCCCC)\n\nWhat is this?";
		const { markdown: shrunk, restore } =
			shrinkImageUrlsForNormalizer(markdown);

		expect(shrunk).not.toContain("base64");
		expect(shrunk).toContain("![Uploaded image](kontinue-image-0)");
		expect(restore(`[USER]:\n${shrunk}`)).toContain(
			"data:image/png;base64,AAAABBBBCCCC",
		);
	});

	test("shrinks an over-long signed attachment URL", () => {
		const signed = `https://files.oaiusercontent.com/file-abc?${"sig=x&".repeat(60)}`;
		const { markdown: shrunk, restore } = shrinkImageUrlsForNormalizer(
			`![Uploaded image](${signed})`,
		);

		expect(shrunk).toBe("![Uploaded image](kontinue-image-0)");
		expect(restore(shrunk)).toBe(`![Uploaded image](${signed})`);
	});

	test("leaves ordinary image URLs untouched", () => {
		const markdown = "![chart](https://cdn.example.com/chart.png)";
		expect(shrinkImageUrlsForNormalizer(markdown).markdown).toBe(markdown);
	});
});
