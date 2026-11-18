// The pricing comparison matrix (every plan limit, in words), shared by the
// web pricing page and the Expo pricing screen so the numbers cannot drift.

import { getKodeModelAccess, KODE_MODELS } from "@repo/ai/lib/kode";
import { getKodeUsageLimits } from "@repo/ai/lib/kode-usage";
import { PLAN_DEFINITIONS } from "./plan-config";
import {
	getImportUploadLimitBytes,
	PLAN_TIERS,
	type PlanTier,
} from "./plan-tier";

export type PricingComparisonValue = string | boolean;
type Value = PricingComparisonValue;
export type PricingComparisonRow = {
	label: string;
	description?: string;
	values: Record<PlanTier, Value>;
};

const tiers = [...PLAN_TIERS];

function values(mapper: (tier: PlanTier) => Value): Record<PlanTier, Value> {
	return Object.fromEntries(
		tiers.map((tier) => [tier, mapper(tier)]),
	) as Record<PlanTier, Value>;
}

function count(value: number): string {
	return value.toLocaleString("en-US");
}

function bytes(value: number): string {
	if (value >= 1024 ** 3) return `${value / 1024 ** 3} GB`;
	if (value >= 1024 ** 2) return `${value / 1024 ** 2} MB`;
	return `${value / 1024} KB`;
}

function requestValue(
	tier: PlanTier,
	group: "kai" | "basic" | "pro" | "frontier",
) {
	const limit = PLAN_DEFINITIONS[tier].monthlyRequests[group];
	return limit === 0 ? "Not included" : `${count(limit)}/month`;
}

function contextValue(
	tier: PlanTier,
	group: "kai" | "basic" | "pro" | "frontier",
) {
	const plan = PLAN_DEFINITIONS[tier];
	const context = plan.contextTokens[group];
	if (context === 0) return "Not included";
	return `${context / 1000}K / ${plan.maxOutputTokens[group] / 1000}K`;
}

export const PRICING_COMPARISON_SECTIONS: Array<{
	title: string;
	rows: PricingComparisonRow[];
}> = [
	{
		title: "AI and models",
		rows: [
			{
				label: "K-AI requests",
				description:
					"Monthly requests to Kontinue’s native intelligence layer.",
				values: values((tier) => requestValue(tier, "kai")),
			},
			{
				label: "Basic-model requests",
				description:
					"Fast, cost-efficient models for everyday writing, analysis, coding, and multimodal work.",
				values: values((tier) => requestValue(tier, "basic")),
			},
			{
				label: "Pro-model requests",
				description:
					"Higher-capability GPT, Claude, Gemini, Perplexity, and other supported models.",
				values: values((tier) => requestValue(tier, "pro")),
			},
			{
				label: "Frontier-model requests",
				description:
					"The highest-cost, most capable included models. Availability can change as providers reprice or retire models.",
				values: values((tier) => requestValue(tier, "frontier")),
			},
			{
				label: "AI usage credits",
				description:
					"Shared metering for paid chat work, web search, K-Image, K-Video, Live, Canvas AI actions, and Kode AI runs. Opening Canvas or Kode does not use credits.",
				values: values((tier) => count(PLAN_DEFINITIONS[tier].aiUsageCredits)),
			},
			{
				label: "Included model access",
				description:
					"Starter includes GPT-5.4 mini, Gemini 3 Flash, and Gemini 3.1 Flash Lite. Higher plans unlock the wider catalogue by model group.",
				values: {
					free: "K-AI",
					starter: "K-AI + 3 Basic models",
					plus: "K-AI + Basic + Pro",
					pro: "K-AI + Basic + Pro + Frontier",
					max: "All included groups",
				},
			},
		],
	},
	{
		title: "Context per request",
		rows: (["kai", "basic", "pro", "frontier"] as const).map((group) => ({
			label: `${group === "kai" ? "K-AI" : `${group.charAt(0).toUpperCase()}${group.slice(1)}`} context / output`,
			description:
				"Context includes instructions, conversation history, files, tools, and retrieved memory. Output is the maximum generated response.",
			values: values((tier) => contextValue(tier, group)),
		})),
	},
	{
		title: "Conversations and files",
		rows: [
			{
				label: "Conversation imports",
				description:
					"Imports from supported shared links or exports. Unlimited tiers have fair-use soft caps to prevent automated bulk abuse.",
				values: values((tier) => {
					const plan = PLAN_DEFINITIONS[tier];
					return plan.chatImports === null
						? `Unlimited fair use (${count(plan.importFairUseSoftLimit ?? 0)} soft cap)`
						: `${count(plan.chatImports)}/month`;
				}),
			},
			{
				label: "Data-import archive size",
				description:
					"Maximum size of a supported account or conversation archive. This is separate from files attached to a chat.",
				values: values((tier) => bytes(getImportUploadLimitBytes(tier))),
			},
			{
				label: "Chat file uploads",
				description: "Daily limits reset at 00:00 UTC.",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].chatUploadsPerDay;
					return limit === 0 ? "Not included" : `${limit}/day`;
				}),
			},
			{
				label: "Maximum chat file size",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].maxChatUploadBytes;
					return limit === 0 ? "Not included" : bytes(limit);
				}),
			},
			{
				label: "Stored files",
				description:
					"Storage for uploaded documents and media, separate from AI memory.",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].storedFilesBytes;
					return limit === 0 ? "Not included" : bytes(limit);
				}),
			},
			{
				label: "Export and import your data",
				values: values(() => true),
			},
		],
	},
	{
		title: "Search, memory, and creation",
		rows: [
			{
				label: "Web searches",
				description: "Provider-backed searches for current information.",
				values: values(
					(tier) => `${count(PLAN_DEFINITIONS[tier].webSearches)}/month`,
				),
			},
			{
				label: "Search availability",
				values: values((tier) =>
					PLAN_DEFINITIONS[tier].webSearchAllModels
						? "All available models"
						: "K-AI only",
				),
			},
			{
				label: "AI memory",
				description:
					"Searchable memories Kontinue can retrieve in future work.",
				values: values((tier) => bytes(PLAN_DEFINITIONS[tier].memoryBytes)),
			},
			{
				label: "K-Image generations",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].imageGenerations;
					return limit === 0 ? "Not included" : `${limit}/month`;
				}),
			},
			{
				label: "K-Video generation",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].videoGenerationSeconds;
					return limit === 0 ? "Not included" : `${limit} sec/month`;
				}),
			},
		],
	},
	{
		title: "Professional tools",
		rows: [
			{
				label: "Kontinue Live",
				description: "Realtime, interruptible voice sessions.",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].liveVoiceMinutes;
					return limit === 0 ? "Not included" : `${limit} min/month`;
				}),
			},
			{
				label: "Canvas",
				description:
					"The workspace is included on Pro and Max. AI generation inside it consumes usage credits.",
				values: values((tier) => PLAN_DEFINITIONS[tier].canvas),
			},
			{
				label: "Kode desktop",
				description:
					"The Kode coding app. Usage is measured by real model cost, so lighter models go further. A 5-hour and a weekly limit apply; paid plans keep Kode 1.0 working after a limit is reached. Usage shown relative to Free.",
				values: values((tier) => kodeDesktopSummary(tier)),
			},
			{
				label: "Kode on the web",
				description:
					"Access and build ceilings are included. Kode reserves AI units while it works, then returns unused units. One unit covers up to 25K model tokens and costs 25 shared AI usage credits.",
				values: values((tier) => {
					const plan = PLAN_DEFINITIONS[tier];
					if (plan.kodeMode === "none") return "Not included";
					return `${plan.kodeMode === "lite" ? "Kode Lite" : "Full Kode"} · ${plan.kodeBuilds} builds/month`;
				}),
			},
		],
	},
];

export function kodeDesktopSummary(tier: PlanTier): string {
	const usage = Math.round(
		getKodeUsageLimits(tier).monthlyMicros /
			getKodeUsageLimits("free").monthlyMicros,
	);
	const models = KODE_MODELS.filter(
		(model) => getKodeModelAccess(model, tier) === "included",
	);
	const access =
		tier === "free"
			? `Kode 1.0 + ${models.length - 1} light models`
			: tier === "starter" || tier === "plus"
				? `${models.length} light models`
				: tier === "pro"
					? "All models · Fast mode"
					: "All models incl. Fable & Astra · Fast mode";
	return tier === "free" ? access : `${access} · ${usage}× usage`;
}
