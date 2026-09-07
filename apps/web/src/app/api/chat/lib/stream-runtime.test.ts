import { describe, expect, test } from "bun:test";
import type { LanguageModel, ToolSet } from "ai";
import {
	buildStreamOptions,
	getTotalOutputTokens,
	stopWhenOutputBudgetReached,
} from "./stream-runtime";

describe("getTotalOutputTokens", () => {
	test("adds output tokens across steps", () => {
		expect(
			getTotalOutputTokens([
				{ usage: { outputTokens: 75 } },
				{ usage: { outputTokens: 50 } },
				{ usage: {} },
			]),
		).toBe(125);
	});
});

describe("stopWhenOutputBudgetReached", () => {
	test("stops once the cumulative output budget is exhausted", () => {
		const shouldStop = stopWhenOutputBudgetReached(200);

		expect(
			shouldStop({
				steps: [
					{ usage: { outputTokens: 120 } },
					{ usage: { outputTokens: 79 } },
				] as never[],
			}),
		).toBe(false);

		expect(
			shouldStop({
				steps: [
					{ usage: { outputTokens: 120 } },
					{ usage: { outputTokens: 80 } },
				] as never[],
			}),
		).toBe(true);
	});
});

describe("buildStreamOptions web-search accounting", () => {
	function optionsWithSearchCounter(charges: number[]) {
		return buildStreamOptions({
			model: {} as LanguageModel,
			systemPrompt: "system",
			modelMessages: [],
			maxOutputTokens: 1000,
			tools: {} as ToolSet,
			shouldDisableTools: false,
			hasTools: true,
			forceImageTool: false,
			forceWebSearchTool: false,
			stopWhen: [],
			onWebSearchToolCall: (callCount) => charges.push(callCount),
		});
	}

	function finishStep(
		options: ReturnType<typeof buildStreamOptions>,
		toolNames: string[],
	) {
		options.onStepFinish({
			finishReason: "tool-calls",
			toolCalls: toolNames.map((toolName) => ({ toolName })),
			toolResults: [],
		});
	}

	test("reports a search the model made on its own", () => {
		// The whole point of auto mode: the user never flipped the toggle, the
		// model decided to search, and that search still has to be accounted for.
		const charges: number[] = [];
		const options = optionsWithSearchCounter(charges);

		finishStep(options, ["perplexity_search"]);

		expect(charges).toEqual([1]);
	});

	test("does not report anything when the model never searched", () => {
		const charges: number[] = [];
		const options = optionsWithSearchCounter(charges);

		finishStep(options, ["get_current_time"]);
		finishStep(options, []);

		expect(charges).toEqual([]);
	});

	test("counts repeat searches within one turn so the caller can cap them", () => {
		// The route charges only callCount === 1, so a model that searches three
		// times in a single answer still costs the user one web search.
		const charges: number[] = [];
		const options = optionsWithSearchCounter(charges);

		finishStep(options, ["perplexity_search"]);
		finishStep(options, ["perplexity_search", "perplexity_search"]);

		expect(charges).toEqual([1, 2, 3]);
		expect(charges.filter((callCount) => callCount === 1)).toHaveLength(1);
	});

	test("stays silent when no counter is wired (K-AI charges in its pipeline)", () => {
		const options = buildStreamOptions({
			model: {} as LanguageModel,
			systemPrompt: "system",
			modelMessages: [],
			maxOutputTokens: 1000,
			tools: {} as ToolSet,
			shouldDisableTools: false,
			hasTools: true,
			forceImageTool: false,
			forceWebSearchTool: false,
			stopWhen: [],
		});

		expect(() => finishStep(options, ["perplexity_search"])).not.toThrow();
	});
});
