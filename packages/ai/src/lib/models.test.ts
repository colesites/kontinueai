import { describe, expect, test } from "bun:test";
import { ANTHROPIC_MODELS } from "./anthropic";
import { AVAILABLE_MODELS } from "./models";
import { OPENAI_MODELS } from "./openai";

describe("AI model catalog", () => {
	test("includes the GPT 5.6 family", () => {
		expect(OPENAI_MODELS.map((model) => model.id)).toEqual(
			expect.arrayContaining([
				"openai/gpt-5.6-sol",
				"openai/gpt-5.6-terra",
				"openai/gpt-5.6-luna",
			]),
		);
	});

	test("includes Sonnet 5 and keeps Fable 5", () => {
		expect(ANTHROPIC_MODELS.map((model) => model.id)).toEqual(
			expect.arrayContaining([
				"anthropic/claude-sonnet-5",
				"anthropic/claude-fable-5",
			]),
		);
	});

	test("keeps model IDs unique", () => {
		const ids = AVAILABLE_MODELS.map((model) => model.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
