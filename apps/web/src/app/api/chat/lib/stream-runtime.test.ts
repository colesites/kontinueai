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

describe("buildStreamOptions forced tools", () => {
	const tools = {
		image_generation: {},
		perplexity_search: {},
		create_task: {},
	} as unknown as ToolSet;

	function build(forceImageTool: boolean, forceWebSearchTool = false) {
		return buildStreamOptions({
			model: {} as LanguageModel,
			systemPrompt: "system",
			modelMessages: [],
			maxOutputTokens: 1000,
			tools,
			shouldDisableTools: false,
			hasTools: true,
			forceImageTool,
			forceWebSearchTool,
			stopWhen: [],
		});
	}
	const step = (...names: string[]) => ({
		toolCalls: names.map((toolName) => ({ toolName })),
	});

	test("never pins toolChoice for the whole turn", () => {
		expect("toolChoice" in build(true)).toBe(false);
	});

	test("forces the image tool on the first step only", () => {
		const { prepareStep } = build(true);
		expect(prepareStep?.({ stepNumber: 0, steps: [] })).toEqual({
			toolChoice: { type: "tool", toolName: "image_generation" },
		});
	});

	test("drops the image tool once an image was made, so it isn't repeated", () => {
		const { prepareStep } = build(true);
		const next = prepareStep?.({
			stepNumber: 1,
			steps: [step("image_generation")],
		});
		expect(next).toEqual({ activeTools: ["perplexity_search", "create_task"] });
	});

	test("forced web search applies to the first step only", () => {
		const { prepareStep } = build(false, true);
		expect(prepareStep?.({ stepNumber: 0, steps: [] })).toEqual({
			toolChoice: { type: "tool", toolName: "perplexity_search" },
		});
		expect(
			prepareStep?.({ stepNumber: 1, steps: [step("perplexity_search")] }),
		).toEqual({});
	});
});
