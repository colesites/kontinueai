import { describe, expect, it } from "bun:test";
import { detectSearchIntent } from "./intent";

const searches = (q: string) => detectSearchIntent(q).shouldSearch;

describe("detectSearchIntent — explicit requests", () => {
	it("treats any request to search as explicit, not just 'search the web'", () => {
		// The phrasing that used to fall through and get answered from stale
		// model knowledge, with no sources and a wrong fixture.
		expect(searches("help me search for chelsea next epl match")).toBe(true);
		expect(searches("can you search chelsea fixtures")).toBe(true);
		expect(searches("search for the next eclipse")).toBe(true);
		expect(searches("look up the gbp to usd rate")).toBe(true);
		expect(searches("google the best laptop 2026")).toBe(true);
	});

	it("still honours the original phrasings", () => {
		expect(searches("search the web for chelsea next epl match")).toBe(true);
		expect(searches("search online for flight prices")).toBe(true);
	});
});

describe("detectSearchIntent — searches over the user's own data", () => {
	// These are the connector tools' job (gmail, drive, notion, github…). Sending
	// them to the web would answer the wrong question AND spend a web search.
	it("does not treat a connector search as a web search", () => {
		expect(searches("search my gmail for the invoice")).toBe(false);
		expect(searches("search my drive for the pitch deck")).toBe(false);
		expect(searches("search my notion for the roadmap")).toBe(false);
		expect(searches("search the codebase for this function")).toBe(false);
		expect(searches("search my calendar for next week")).toBe(false);
	});

	it("does not treat an @-mentioned connector as a web search", () => {
		expect(searches("@gmail search for receipts from stripe")).toBe(false);
		expect(searches("@github search for the auth module")).toBe(false);
	});
});

describe("detectSearchIntent — unchanged behaviour", () => {
	it("still searches on recency signals alone", () => {
		expect(searches("bitcoin price right now")).toBe(true);
		expect(searches("chelsea next fixture this week")).toBe(true);
	});

	it("still leaves self-contained work alone", () => {
		expect(searches("write me a python script")).toBe(false);
		expect(searches("explain how promises work")).toBe(false);
		expect(searches("refactor this function")).toBe(false);
	});
});
