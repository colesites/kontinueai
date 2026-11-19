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

	test("includes the GPT-6.2 generation and Gemini 4 Neon", () => {
		expect(OPENAI_MODELS.map((model) => model.id)).toEqual(
			expect.arrayContaining([
				"openai/gpt-6.2-sol",
				"openai/gpt-6.2-astra",
				"openai/gpt-6.2-sol-fast",
				"openai/gpt-6.2-astra-fast",
			]),
		);
		expect(GOOGLE_MODELS.map((model) => model.id)).toEqual(
			expect.arrayContaining(["google/gemini-4-neon"]),
		);
	});

	test("every newest model is pickable in both catalogue surfaces", () => {
		// The main catalogue and Kode must not drift: anything added to one is
		// expected to be pickable in the other. Fast variants are separate
		// entries in the main catalogue but a `fast` field in Kode.
		const mainIds = new Set(AVAILABLE_MODELS.map((model) => model.id));
		for (const id of [
			"google/gemini-4-neon",
			"openai/gpt-6.2-sol",
			"openai/gpt-6.2-sol-fast",
			"openai/gpt-6.2-astra",
			"openai/gpt-6.2-astra-fast",
			"anthropic/claude-opus-5.5-fast",
			"anthropic/claude-fable-5.2-fast",
		]) {
			expect(mainIds).toContain(id);
			expect(getKodeModelById(id) ?? getKodeModelById(id.replace(/-fast$/, ""))).toBeDefined();
		}
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

import { canUseFastMode, getKodeModelAccess, getKodeModelById, KODE_MAX_OUTPUT_TOKENS, KODE_MODELS, kodeMaxOutputTokens } from "./kode";

test("Kode requests carry an output budget except on OpenAI models", () => {
	expect(kodeMaxOutputTokens("deepseek/deepseek-v4.1-flash-1017")).toBe(KODE_MAX_OUTPUT_TOKENS);
	expect(kodeMaxOutputTokens("zai/glm-5.3-flash")).toBe(KODE_MAX_OUTPUT_TOKENS);
	expect(kodeMaxOutputTokens("openai/gpt-6-luna")).toBeNull();
});

describe("Kode model catalog", () => {
	/** Lookup that fails the test by name instead of leaning on `!`. */
	function mustModel(id: string) {
		const model = getKodeModelById(id);
		if (!model) throw new Error(`Missing Kode model: ${id}`);
		return model;
	}

	test("keeps model IDs unique", () => {
		const ids = KODE_MODELS.map((model) => model.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("has the newest models, priced from the AI Gateway catalog", () => {
		const neon = mustModel("google/gemini-4-neon");
		expect(neon.tier).toBe("frontier");
		expect(neon.gatewayId).toBe("google/gemini-4-neon");
		expect(neon.price).toEqual({ input: 3, output: 15, cacheRead: 0.15 });
		expect(neon.contextWindow).toBe(1_000_000);
		// Gemini 4 takes low/medium/high/xhigh; it has no "max" effort.
		expect(neon.reasoning.efforts).toEqual(["low", "medium", "high", "xhigh"]);
		// No fast variant on the gateway, so Fast mode is unavailable.
		expect(neon.fast).toBeUndefined();

		const sol = mustModel("openai/gpt-6.2-sol");
		expect(sol.tier).toBe("frontier");
		expect(sol.price).toEqual({ input: 2, output: 10, cacheRead: 0.1 });
		expect(sol.contextWindow).toBe(1_050_000);
		expect(sol.fast?.gatewayId).toBe("openai/gpt-6.2-sol-fast");
		expect(sol.fast?.price).toEqual({ input: 4, output: 20, cacheRead: 0.2 });

		const astra = mustModel("openai/gpt-6.2-astra");
		expect(astra.tier).toBe("ultra");
		expect(astra.price).toEqual({ input: 8, output: 40, cacheRead: 0.4 });
		expect(astra.fast?.gatewayId).toBe("openai/gpt-6.2-astra-fast");
		expect(astra.fast?.price).toEqual({ input: 16, output: 80, cacheRead: 0.8 });
	});

	test("GPT-6.2 Astra is cheaper than the GPT-6 Astra it replaces", () => {
		const old = mustModel("openai/gpt-6-astra");
		const next = mustModel("openai/gpt-6.2-astra");
		expect(next.price.input).toBeLessThan(old.price.input);
		expect(next.price.output).toBeLessThan(old.price.output);
		expect(next.price.cacheRead).toBeLessThan(old.price.cacheRead);
	});

	test("fast variants are distinct ids and cost more than the base model", () => {
		for (const model of KODE_MODELS) {
			if (!model.fast) continue;
			expect(model.fast.gatewayId).not.toBe(model.gatewayId);
			expect(model.fast.price.input).toBeGreaterThan(model.price.input);
			expect(model.fast.price.output).toBeGreaterThan(model.price.output);
		}
	});

	test("new models follow the plan rules", () => {
		const sol = mustModel("openai/gpt-6.2-sol");
		const astra = mustModel("openai/gpt-6.2-astra");
		const neon = mustModel("google/gemini-4-neon");

		// Frontier: locked on Starter/Plus, included on Pro and Max.
		expect(getKodeModelAccess(sol, "plus")).toBe("locked");
		expect(getKodeModelAccess(sol, "pro")).toBe("included");
		expect(getKodeModelAccess(sol, "max")).toBe("included");
		expect(getKodeModelAccess(neon, "pro")).toBe("included");
		// Ultra: paid from credits on Pro, included on Max.
		expect(getKodeModelAccess(astra, "pro")).toBe("credits");
		expect(getKodeModelAccess(astra, "max")).toBe("included");

		// Fast mode is Pro/Max only, and only where a variant exists.
		expect(canUseFastMode(sol, "pro")).toBe(true);
		expect(canUseFastMode(sol, "max")).toBe(true);
		expect(canUseFastMode(sol, "plus")).toBe(false);
		expect(canUseFastMode(neon, "pro")).toBe(false);
	});
});
