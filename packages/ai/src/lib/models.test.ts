import { describe, expect, test } from "bun:test";
import { ALIBABA_MODELS } from "./alibaba";
import { ANTHROPIC_MODELS } from "./anthropic";
import { DEEPSEEK_MODELS } from "./deepseek";
import { GOOGLE_MODELS } from "./google";
import { MINIMAX_MODELS } from "./minimax";
import { MISTRAL_MODELS } from "./mistral";
import { AVAILABLE_MODELS } from "./models";
import { MOONSHOTAI_MODELS } from "./moonshotai";
import { OPENAI_MODELS } from "./openai";
import { XAI_MODELS } from "./xai";
import { ZAI_MODELS } from "./zai";

describe("AI model catalog", () => {
	test("includes the GPT 6.1 and 5.6 family", () => {
		expect(OPENAI_MODELS.map((model) => model.id)).toEqual(
			expect.arrayContaining([
				"openai/gpt-6.1-sol",
				"openai/gpt-6-sol",
				"openai/gpt-6-luna",
				"openai/gpt-5.6-sol",
				"openai/gpt-5.6-terra",
				"openai/gpt-5.6-luna",
			]),
		);
	});

	test("registers realtime voice models outside the text-chat surface", () => {
		expect(OPENAI_MODELS).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "openai/gpt-live-1",
					modality: "realtime",
				}),
				expect.objectContaining({
					id: "openai/gpt-realtime-1.5",
					modality: "realtime",
				}),
				expect.objectContaining({
					id: "openai/gpt-realtime-2.1",
					modality: "realtime",
				}),
			]),
		);

		expect(GOOGLE_MODELS).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "google/gemini-3.8-live",
					modality: "realtime",
				}),
			]),
		);
	});

	test("includes Claude 5.5 generation, Sonnet 5, and Fable 5", () => {
		expect(ANTHROPIC_MODELS.map((model) => model.id)).toEqual(
			expect.arrayContaining([
				"anthropic/claude-opus-5.5",
				"anthropic/claude-sonnet-5.5",
				"anthropic/claude-haiku-5.5",
				"anthropic/claude-sonnet-5",
				"anthropic/claude-fable-5",
			]),
		);
	});

	test("includes latest flagship models across providers", () => {
		expect(ALIBABA_MODELS.map((m) => m.id)).toEqual(
			expect.arrayContaining(["alibaba/qwen3.8-max", "alibaba/qwen3.8-flash"]),
		);
		expect(DEEPSEEK_MODELS.map((m) => m.id)).toEqual(
			expect.arrayContaining(["deepseek/deepseek-v4.1-flash", "deepseek/deepseek-r1"]),
		);
		expect(XAI_MODELS.map((m) => m.id)).toEqual(
			expect.arrayContaining(["spacexai/grok-4.7", "spacexai/grok-build-0.1"]),
		);
		expect(MOONSHOTAI_MODELS.map((m) => m.id)).toEqual(
			expect.arrayContaining(["moonshotai/kimi-k3", "moonshotai/kimi-k2.7-code"]),
		);
		expect(MINIMAX_MODELS.map((m) => m.id)).toEqual(
			expect.arrayContaining(["minimax/minimax-m3", "minimax/minimax-m2.5"]),
		);
		expect(MISTRAL_MODELS.map((m) => m.id)).toEqual(
			expect.arrayContaining(["mistral/mistral-large-4", "mistral/codestral"]),
		);
		expect(ZAI_MODELS.map((m) => m.id)).toEqual(
			expect.arrayContaining(["zai/glm-5.3", "zai/glm-5.3-flash"]),
		);
		expect(GOOGLE_MODELS.map((m) => m.id)).toEqual(
			expect.arrayContaining(["google/gemini-4-argon"]),
		);
	});

	test("keeps model IDs unique", () => {
		const ids = AVAILABLE_MODELS.map((model) => model.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
