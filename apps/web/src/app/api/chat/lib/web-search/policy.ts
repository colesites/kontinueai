// Web-search policy: decides whether a turn gets live web results.
//
// The Web Search toggle is a FORCE switch, not an on/off gate. Leaving it off
// does not mean "never search" — it means "search when the question needs it",
// which is what people expect from ChatGPT and Claude. Turning it on means
// "search this turn regardless of what the intent heuristic thinks".
//
// Whichever way a search is triggered, it is billed identically: an
// auto-triggered search costs exactly one web search against the user's monthly
// quota (see `webSearch.consumeSearchQuota`). The toggle changes *when* we
// search, never *whether* we count it.

import { detectSearchIntent } from "./intent";

// "forced"  — user flipped the toggle on: search this turn.
// "auto"    — toggle off, but the query needs live data: search this turn.
// "off"     — no search this turn (self-contained query, plan, or quota).
export type WebSearchMode = "off" | "auto" | "forced";

// How the search was triggered. Telemetry only — both cost the same.
export type WebSearchTrigger = "manual" | "auto";

export interface WebSearchPolicy {
	mode: WebSearchMode;
	trigger: WebSearchTrigger;
	// The heuristic's read on whether this particular query needs live data.
	//
	// Two very different consumers: gateway models get the search tool and pick
	// for themselves, so there this only decides how firmly the prompt nudges
	// them. K-AI has no model-side tool — its search is a server-side retrieval
	// pipeline that runs before the model sees the message — so for K-AI this
	// flag alone decides whether the search runs.
	intentLikely: boolean;
	confidence: number;
	reason: string;
}

export interface ResolveWebSearchPolicyArgs {
	// The client's Web Search toggle for this message.
	toggleOn: boolean;
	// Whether this model + plan may search at all (K-AI: every tier; gateway
	// models: paid tiers only).
	planAllowsSearch: boolean;
	// Whether this surface can search at all (e.g. a model with no search path).
	surfaceSupportsSearch: boolean;
	lastUserContent: string;
	// Research/Marketing agents bias toward live data.
	aggressive?: boolean;
}

export function resolveWebSearchPolicy(
	args: ResolveWebSearchPolicyArgs,
): WebSearchPolicy {
	const {
		toggleOn,
		planAllowsSearch,
		surfaceSupportsSearch,
		lastUserContent,
		aggressive = false,
	} = args;

	if (!surfaceSupportsSearch) {
		return {
			mode: "off",
			trigger: "auto",
			intentLikely: false,
			confidence: 0,
			reason: "model has no web-search path",
		};
	}
	if (!planAllowsSearch) {
		return {
			mode: "off",
			trigger: toggleOn ? "manual" : "auto",
			intentLikely: false,
			confidence: 0,
			reason: "plan does not include web search for this model",
		};
	}

	const intent = detectSearchIntent(lastUserContent, { aggressive });

	// Explicit opt-in wins: never second-guess a user who asked for a search.
	if (toggleOn) {
		return {
			mode: "forced",
			trigger: "manual",
			intentLikely: intent.shouldSearch,
			confidence: 1,
			reason: "web search toggle on",
		};
	}

	// Toggle off is AUTO, not never. Nothing here decides against searching — the
	// model (or, for K-AI, `intentLikely`) makes that call per message.
	return {
		mode: "auto",
		trigger: "auto",
		intentLikely: intent.shouldSearch,
		confidence: intent.confidence,
		reason: intent.reason,
	};
}

// True when this turn should search, whoever asked for it.
export function policyWantsSearch(policy: WebSearchPolicy): boolean {
	return policy.mode !== "off";
}

// K-AI's server-side pipeline has no model in the loop to decide for itself, so
// it runs only on an explicit toggle or a positive intent read.
export function shouldRunRetrievalPipeline(policy: WebSearchPolicy): boolean {
	return (
		policy.mode === "forced" || (policy.mode === "auto" && policy.intentLikely)
	);
}
