import { describe, expect, test } from "bun:test";
import {
	collectGeneratedFilesFromParts,
	formatFileBytes,
	mergeImportedChunks,
	splitReasoningFromParts,
} from "./chat-message-parts";

describe("splitReasoningFromParts", () => {
	test("pulls an inline <think> block out of the answer", () => {
		const split = splitReasoningFromParts([
			{ type: "text", text: "<think>weigh options</think>Final answer" },
		] as never);
		expect(split.content).toBe("Final answer");
		expect(split.reasoningText).toBe("weigh options");
	});

	test("prefers native reasoning parts", () => {
		const split = splitReasoningFromParts([
			{ type: "reasoning", text: "native" },
			{ type: "text", text: "Answer" },
		] as never);
		expect(split).toEqual({ content: "Answer", reasoningText: "native" });
	});

	test("hides an unfinished think block while it streams", () => {
		const split = splitReasoningFromParts([
			{ type: "text", text: "<think>still going" },
		] as never);
		expect(split.content).toBe("");
		expect(split.reasoningText).toBe("still going");
	});
});

describe("collectGeneratedFilesFromParts", () => {
	test("returns run_code files only from successful runs", () => {
		const files = collectGeneratedFilesFromParts([
			{
				type: "tool-run_code",
				output: {
					ok: true,
					files: [{ name: "report.csv", url: "https://x/r.csv", bytes: 2048 }],
				},
			},
			{
				type: "tool-run_code",
				output: { ok: false, files: [{ name: "x", url: "https://x/x" }] },
			},
		] as never);
		expect(files).toEqual([
			{ name: "report.csv", url: "https://x/r.csv", bytes: 2048 },
		]);
		expect(formatFileBytes(2048)).toBe("2 KB");
	});
});

describe("mergeImportedChunks", () => {
	test("joins consecutive imported chunks from the same speaker", () => {
		const merged = mergeImportedChunks([
			{ role: "assistant", content: "a", imageParts: [], isImported: true },
			{ role: "assistant", content: "b", imageParts: [], isImported: true },
		]);
		expect(merged).toHaveLength(1);
		expect(merged[0]?.content).toBe("a\n\nb");
	});
});
