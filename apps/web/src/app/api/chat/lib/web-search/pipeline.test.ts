import { describe, expect, it } from "bun:test";
import { buildContext } from "./pipeline";

// Five results, each long enough that the old first-come-first-served budget
// spent itself before reaching the last one. The answer to the question lives
// in the LAST result, which is where search engines often put the useful page.
function fiveResults() {
	return Array.from({ length: 5 }, (_, i) => ({
		title: `Source ${i + 1}`,
		url: `https://example.com/source-${i + 1}`,
		content:
			`${"filler ".repeat(200)}` +
			(i === 4 ? "THE ANSWER IS SEP 12 v HULL" : "nothing useful here"),
	}));
}

describe("buildContext", () => {
	it("includes every source, not just the ones the budget reached first", () => {
		const { contextText, sources } = buildContext(null, fiveResults());

		expect(sources).toHaveLength(5);
		for (let i = 1; i <= 5; i++) {
			expect(contextText).toContain(`[${i}] Source ${i}`);
		}
	});

	it("stays inside the context budget while doing so", () => {
		const { contextText } = buildContext("a summary", fiveResults());
		expect(contextText.length).toBeLessThanOrEqual(6000);
	});

	it("labels a provider summary as unverified rather than as the answer", () => {
		// Tavily's synthesized answer is regularly wrong on "next X" questions; a
		// small model repeats it verbatim if we present it as settled fact.
		const { contextText } = buildContext(
			"Chelsea's next match is against Crystal Palace on December 2.",
			fiveResults(),
		);
		expect(contextText).toContain("Unverified provider summary");
		expect(contextText).toContain("trust the sources when they disagree");
	});

	it("gives every source a real share of the budget", () => {
		const { sources } = buildContext(null, fiveResults());
		for (const s of sources) {
			expect((s.snippet ?? "").length).toBeGreaterThan(0);
		}
	});
});
