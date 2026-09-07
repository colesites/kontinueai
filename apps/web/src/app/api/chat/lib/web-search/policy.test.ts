import { describe, expect, it } from "bun:test";
import { resolveWebSearchPolicy, shouldRunRetrievalPipeline } from "./policy";

const base = {
	planAllowsSearch: true,
	surfaceSupportsSearch: true,
	toggleOn: false,
};

describe("resolveWebSearchPolicy", () => {
	it("forces a search when the toggle is on, whatever the query looks like", () => {
		const policy = resolveWebSearchPolicy({
			...base,
			toggleOn: true,
			lastUserContent: "write me a regex for email validation",
		});
		expect(policy.mode).toBe("forced");
		expect(policy.trigger).toBe("manual");
	});

	it("leaves search available with the toggle OFF — off means auto, not never", () => {
		const policy = resolveWebSearchPolicy({
			...base,
			lastUserContent: "what is the latest news on the fed rate decision today",
		});
		expect(policy.mode).toBe("auto");
		expect(policy.trigger).toBe("auto");
		expect(policy.intentLikely).toBe(true);
	});

	it("stays in auto for a self-contained query, but does not search", () => {
		// A gateway model still gets the tool and can overrule this; K-AI's
		// retrieval pipeline, which has no model in the loop, does not run.
		const policy = resolveWebSearchPolicy({
			...base,
			lastUserContent: "explain how to refactor this function",
		});
		expect(policy.mode).toBe("auto");
		expect(policy.intentLikely).toBe(false);
		expect(shouldRunRetrievalPipeline(policy)).toBe(false);
	});

	it("runs the retrieval pipeline on intent alone, with the toggle off", () => {
		const policy = resolveWebSearchPolicy({
			...base,
			lastUserContent: "bitcoin price right now",
		});
		expect(shouldRunRetrievalPipeline(policy)).toBe(true);
		// Auto is a trigger label, not a discount: the search still gets charged.
		expect(policy.trigger).toBe("auto");
	});

	it("runs the retrieval pipeline whenever the toggle is on", () => {
		const policy = resolveWebSearchPolicy({
			...base,
			toggleOn: true,
			lastUserContent: "explain how to refactor this function",
		});
		expect(shouldRunRetrievalPipeline(policy)).toBe(true);
	});

	it("stays off when the plan does not include search for this model", () => {
		const policy = resolveWebSearchPolicy({
			...base,
			planAllowsSearch: false,
			toggleOn: true,
			lastUserContent: "latest news today",
		});
		expect(policy.mode).toBe("off");
	});

	it("stays off when the model has no search path at all", () => {
		const policy = resolveWebSearchPolicy({
			...base,
			surfaceSupportsSearch: false,
			toggleOn: true,
			lastUserContent: "latest news today",
		});
		expect(policy.mode).toBe("off");
	});

	it("never reports a mode that would let a search go uncounted", () => {
		// Whatever the toggle, a turn that can search is either "forced" or
		// "auto" — both charge. There is no state where a search runs free.
		for (const toggleOn of [true, false]) {
			for (const q of ["latest news today", "write me a haiku"]) {
				const policy = resolveWebSearchPolicy({
					...base,
					toggleOn,
					lastUserContent: q,
				});
				expect(["forced", "auto"]).toContain(policy.mode);
			}
		}
	});

	it("lowers the bar for research-style agents", () => {
		const neutral = "give me an overview of the vertical farming market";
		expect(
			resolveWebSearchPolicy({ ...base, lastUserContent: neutral })
				.intentLikely,
		).toBe(false);
		expect(
			resolveWebSearchPolicy({
				...base,
				lastUserContent: neutral,
				aggressive: true,
			}).intentLikely,
		).toBe(true);
	});
});
