import { formatFileSize, type ProductPlanId, plans } from "@/data/product";

export type PricingComparisonValue = string | boolean;

export interface PricingComparisonRow {
	label: string;
	description?: string;
	values: Record<ProductPlanId, PricingComparisonValue>;
}

export interface PricingComparisonSection {
	title: string;
	rows: PricingComparisonRow[];
}

const [free, starter, plus, pro, max] = plans;

if (!(free && starter && plus && pro && max)) {
	throw new Error("The complete five-plan pricing configuration is required.");
}

function values(
	freeValue: PricingComparisonValue,
	starterValue: PricingComparisonValue,
	plusValue: PricingComparisonValue,
	proValue: PricingComparisonValue,
	maxValue: PricingComparisonValue,
): Record<ProductPlanId, PricingComparisonValue> {
	return {
		free: freeValue,
		starter: starterValue,
		plus: plusValue,
		pro: proValue,
		max: maxValue,
	};
}

function count(value: number): string {
	return value.toLocaleString("en-US");
}

function seconds(value: number): string {
	return value === 0 ? "Not included" : `${value} sec/month`;
}

function importsForPlan(plan: (typeof plans)[number]): string {
	if (plan.limits.automaticImports !== null) {
		return `${count(plan.limits.automaticImports)}/month`;
	}
	return `Unlimited fair use (${count(plan.limits.importFairUseCap ?? 0)} soft cap)`;
}

export const pricingComparisonSections: PricingComparisonSection[] = [
	{
		title: "AI and models",
		rows: [
			{
				label: "K-AI requests",
				description:
					"Monthly requests to Kontinue AI’s native intelligence layer.",
				values: values(
					`${count(free.limits.kaiRequests ?? 0)}/month`,
					`${count(starter.limits.kaiRequests ?? 0)}/month`,
					`${count(plus.limits.kaiRequests ?? 0)}/month`,
					`${count(pro.limits.kaiRequests ?? 0)}/month`,
					`${count(max.limits.kaiRequests ?? 0)}/month`,
				),
			},
			{
				label: "Basic-model requests",
				description:
					"Cost-efficient models for everyday writing, analysis, coding and multimodal work. Requests also draw from AI usage credits.",
				values: values(
					"Not included",
					`${count(starter.limits.basicModelRequests)}/month`,
					`${count(plus.limits.basicModelRequests)}/month`,
					`${count(pro.limits.basicModelRequests)}/month`,
					`${count(max.limits.basicModelRequests)}/month`,
				),
			},
			{
				label: "Pro-model requests",
				description:
					"Higher-capability models such as supported GPT, Claude Sonnet, Gemini Pro and Perplexity options. Requests also draw from AI usage credits.",
				values: values(
					"Not included",
					"Not included",
					`${count(plus.limits.proModelRequests)}/month`,
					`${count(pro.limits.proModelRequests)}/month`,
					`${count(max.limits.proModelRequests)}/month`,
				),
			},
			{
				label: "Frontier-model requests",
				description:
					"Our most capable included models, with tighter context and request limits because their provider costs are higher.",
				values: values(
					"Not included",
					"Not included",
					"Not included",
					`${count(pro.limits.frontierModelRequests)}/month`,
					`${count(max.limits.frontierModelRequests)}/month`,
				),
			},
			{
				label: "AI usage credits",
				description:
					"Shared metering for paid chat tokens and K-AI fallbacks, web search, K-Image, K-Video, Kontinue Live, AI actions in Canvas, and Kode AI runs. Simply opening Canvas or Kode does not use credits.",
				values: values(
					count(free.limits.aiUsageCredits),
					count(starter.limits.aiUsageCredits),
					count(plus.limits.aiUsageCredits),
					count(pro.limits.aiUsageCredits),
					count(max.limits.aiUsageCredits),
				),
			},
			{
				label: "Included model access",
				description:
					"The exact catalogue can change as providers release, reprice or retire models. Kontinue shows only the models available to your plan.",
				values: values(
					"K-AI",
					"K-AI + 3 Basic models",
					"K-AI + Basic + Pro",
					"K-AI + Basic + Pro + Frontier",
					"All included model groups",
				),
			},
		],
	},
	{
		title: "Context per request",
		rows: [
			{
				label: "K-AI context / output",
				description:
					"Context includes system instructions, conversation history, files, tools and retrieved memory. Output is the maximum generated response.",
				values: values(
					"8K / 1K tokens",
					"16K / 2K tokens",
					"32K / 4K tokens",
					"64K / 8K tokens",
					"128K / 16K tokens",
				),
			},
			{
				label: "Basic context / output",
				description:
					"Maximum total input context and generated output for Basic models.",
				values: values(
					"Not included",
					"8K / 1K tokens",
					"16K / 2K tokens",
					"32K / 4K tokens",
					"128K / 8K tokens",
				),
			},
			{
				label: "Pro context / output",
				description:
					"Maximum total input context and generated output for Pro models.",
				values: values(
					"Not included",
					"Not included",
					"8K / 2K tokens",
					"16K / 4K tokens",
					"64K / 8K tokens",
				),
			},
			{
				label: "Frontier context / output",
				description:
					"Maximum total input context and generated output for Frontier models.",
				values: values(
					"Not included",
					"Not included",
					"Not included",
					"8K / 4K tokens",
					"32K / 8K tokens",
				),
			},
		],
	},
	{
		title: "Conversations and files",
		rows: [
			{
				label: "Conversation imports",
				description:
					"Imports created from supported shared links or data exports. Fair-use soft caps protect the service from automated bulk abuse.",
				values: values(
					importsForPlan(free),
					importsForPlan(starter),
					importsForPlan(plus),
					importsForPlan(pro),
					importsForPlan(max),
				),
			},
			{
				label: "Data-import archive size",
				description:
					"Maximum size of a supported account or conversation archive. This is separate from chat file uploads.",
				values: values(
					formatFileSize(free.limits.importUploadBytes),
					formatFileSize(starter.limits.importUploadBytes),
					formatFileSize(plus.limits.importUploadBytes),
					formatFileSize(pro.limits.importUploadBytes),
					formatFileSize(max.limits.importUploadBytes),
				),
			},
			{
				label: "Chat file uploads",
				description:
					"Files attached directly to conversations for analysis. Daily limits reset at 00:00 UTC.",
				values: values(
					"Not included",
					`${starter.limits.chatFileUploadsPerDay}/day`,
					`${plus.limits.chatFileUploadsPerDay}/day`,
					`${pro.limits.chatFileUploadsPerDay}/day`,
					`${max.limits.chatFileUploadsPerDay}/day`,
				),
			},
			{
				label: "Maximum chat file size",
				values: values(
					"Not included",
					formatFileSize(starter.limits.maxChatFileBytes),
					formatFileSize(plus.limits.maxChatFileBytes),
					formatFileSize(pro.limits.maxChatFileBytes),
					formatFileSize(max.limits.maxChatFileBytes),
				),
			},
			{
				label: "Stored files",
				description:
					"Storage for uploaded documents and media. This is separate from searchable AI memory.",
				values: values(
					"Not included",
					formatFileSize(starter.limits.storedFileBytes),
					formatFileSize(plus.limits.storedFileBytes),
					formatFileSize(pro.limits.storedFileBytes),
					formatFileSize(max.limits.storedFileBytes),
				),
			},
			{
				label: "Export and import your data",
				description:
					"Download supported Kontinue data and import supported exports without losing ownership of your information.",
				values: values(true, true, true, true, true),
			},
		],
	},
	{
		title: "Search and creation",
		rows: [
			{
				label: "Web searches",
				description:
					"Provider-backed searches that retrieve current web information. A search also consumes AI usage credits.",
				values: values(
					`${count(free.limits.webSearches)}/month`,
					`${count(starter.limits.webSearches)}/month`,
					`${count(plus.limits.webSearches)}/month`,
					`${count(pro.limits.webSearches)}/month`,
					`${count(max.limits.webSearches)}/month`,
				),
			},
			{
				label: "Search availability",
				values: values(
					free.limits.webSearchAvailability,
					starter.limits.webSearchAvailability,
					plus.limits.webSearchAvailability,
					pro.limits.webSearchAvailability,
					max.limits.webSearchAvailability,
				),
			},
			{
				label: "K-Image generations",
				description:
					"Monthly safety cap for K-Image. Each generation also consumes AI usage credits based on provider cost.",
				values: values(
					"Not included",
					`${count(starter.limits.kImageGenerations)}/month`,
					`${count(plus.limits.kImageGenerations)}/month`,
					`${count(pro.limits.kImageGenerations)}/month`,
					`${count(max.limits.kImageGenerations)}/month`,
				),
			},
			{
				label: "K-Video generation",
				description:
					"Maximum generated video duration per month. Video generation also consumes AI usage credits and varies by resolution and quality.",
				values: values(
					seconds(free.limits.kVideoSeconds),
					seconds(starter.limits.kVideoSeconds),
					seconds(plus.limits.kVideoSeconds),
					seconds(pro.limits.kVideoSeconds),
					seconds(max.limits.kVideoSeconds),
				),
			},
		],
	},
	{
		title: "Memory and professional tools",
		rows: [
			{
				label: "AI memory",
				description:
					"Searchable memories Kontinue can retrieve to personalise future work. This is not ordinary file storage.",
				values: values(
					formatFileSize(free.limits.memoryBytes),
					formatFileSize(starter.limits.memoryBytes),
					formatFileSize(plus.limits.memoryBytes),
					formatFileSize(pro.limits.memoryBytes),
					formatFileSize(max.limits.memoryBytes),
				),
			},
			{
				label: "Kontinue Live",
				description:
					"Realtime voice sessions. Session time and the underlying realtime model usage both count toward your plan limits.",
				values: values(
					"Not included",
					"Not included",
					"Not included",
					`${pro.limits.realtimeVoiceMinutes} min/month`,
					`${max.limits.realtimeVoiceMinutes} min/month`,
				),
			},
			{
				label: "Canvas",
				description:
					"The Canvas workspace is included on Pro and Max. Opening and editing Canvas does not consume credits; AI generation inside it does.",
				values: values(
					free.limits.canvas,
					starter.limits.canvas,
					plus.limits.canvas,
					pro.limits.canvas,
					max.limits.canvas,
				),
			},
			{
				label: "Kode",
				description:
					"Kode access and build-count limits are included. Kode reserves AI units while it works and returns unused units. One unit covers up to 25K model tokens and costs 25 shared AI usage credits.",
				values: values(
					free.limits.kodeAccess,
					starter.limits.kodeAccess,
					plus.limits.kodeAccess,
					`${pro.limits.kodeAccess} · ${pro.limits.kodeBuilds} builds/month`,
					`${max.limits.kodeAccess} · ${max.limits.kodeBuilds} builds/month`,
				),
			},
		],
	},
];
