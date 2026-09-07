import { describe, expect, test } from "bun:test";
import { buildWebSearchContext } from "./prompt";

describe("buildWebSearchContext", () => {
	test("auto mode tells the model it can search and to judge for itself", () => {
		// Toggle off must not read as "you cannot browse" — that was the old
		// behaviour and it made the model refuse live questions outright.
		const context = buildWebSearchContext({
			mode: "auto",
			shouldAttachWebSearchTool: true,
		});

		expect(context).toContain("perplexity_search");
		expect(context).toContain("you decide when to use it");
		expect(context).toContain(
			"Do NOT search for questions you can answer well",
		);
	});

	test("auto mode leans harder when the query reads as needing live data", () => {
		const plain = buildWebSearchContext({
			mode: "auto",
			shouldAttachWebSearchTool: true,
		});
		const nudged = buildWebSearchContext({
			mode: "auto",
			shouldAttachWebSearchTool: true,
			intentLikely: true,
		});

		expect(plain).not.toContain("needs current information");
		expect(nudged).toContain("needs current information");
	});

	test("forced mode says the user asked for the search", () => {
		const context = buildWebSearchContext({
			mode: "forced",
			shouldAttachWebSearchTool: true,
		});

		expect(context).toContain("turned Web Search ON");
	});

	test("explains a forced search that the quota would not allow", () => {
		const context = buildWebSearchContext({
			mode: "off",
			shouldAttachWebSearchTool: false,
			limitReached: true,
		});

		expect(context).toContain("allowance for this month is used up");
	});

	test("says nothing at all when search is off", () => {
		expect(
			buildWebSearchContext({ mode: "off", shouldAttachWebSearchTool: false }),
		).toBe("");
	});
});
