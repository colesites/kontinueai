import type { PlanTier } from "./plan-tier";

export type ModelAccessClass = "kai" | "basic" | "pro" | "frontier";

export type PlanDefinition = {
	name: string;
	priceMonthlyCents: number;
	priceAnnualCents: number;
	priceAnnualMonthlyCents: number;
	monthlyRequests: Record<ModelAccessClass, number>;
	contextTokens: Record<ModelAccessClass, number>;
	maxOutputTokens: Record<ModelAccessClass, number>;
	aiUsageCredits: number;
	chatImports: number | null;
	importFairUseSoftLimit: number | null;
	chatUploadsPerDay: number;
	maxChatUploadBytes: number;
	storedFilesBytes: number;
	memoryBytes: number;
	webSearches: number;
	webSearchAllModels: boolean;
	imageGenerations: number;
	videoGenerationSeconds: number;
	liveVoiceMinutes: number;
	kodeBuilds: number;
	kodeMode: "none" | "lite" | "full";
	canvas: boolean;
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
	free: {
		name: "Free",
		priceMonthlyCents: 0,
		priceAnnualCents: 0,
		priceAnnualMonthlyCents: 0,
		monthlyRequests: { kai: 1_000, basic: 0, pro: 0, frontier: 0 },
		contextTokens: { kai: 8_000, basic: 0, pro: 0, frontier: 0 },
		maxOutputTokens: { kai: 1_000, basic: 0, pro: 0, frontier: 0 },
		aiUsageCredits: 250,
		chatImports: 10,
		importFairUseSoftLimit: null,
		chatUploadsPerDay: 0,
		maxChatUploadBytes: 0,
		storedFilesBytes: 0,
		memoryBytes: Math.round(0.5 * MB),
		webSearches: 30,
		webSearchAllModels: false,
		imageGenerations: 0,
		videoGenerationSeconds: 0,
		liveVoiceMinutes: 0,
		kodeBuilds: 0,
		kodeMode: "none",
		canvas: false,
	},
	starter: {
		name: "Starter",
		priceMonthlyCents: 499,
		priceAnnualCents: 4_800,
		priceAnnualMonthlyCents: 400,
		monthlyRequests: { kai: 2_000, basic: 100, pro: 0, frontier: 0 },
		contextTokens: { kai: 16_000, basic: 8_000, pro: 0, frontier: 0 },
		maxOutputTokens: { kai: 2_000, basic: 1_000, pro: 0, frontier: 0 },
		aiUsageCredits: 1_000,
		chatImports: 50,
		importFairUseSoftLimit: null,
		chatUploadsPerDay: 3,
		maxChatUploadBytes: 5 * MB,
		storedFilesBytes: 250 * MB,
		memoryBytes: 5 * MB,
		webSearches: 100,
		webSearchAllModels: false,
		imageGenerations: 10,
		videoGenerationSeconds: 0,
		liveVoiceMinutes: 0,
		kodeBuilds: 0,
		kodeMode: "none",
		canvas: false,
	},
	plus: {
		name: "Plus",
		priceMonthlyCents: 1_999,
		priceAnnualCents: 20_388,
		priceAnnualMonthlyCents: 1_699,
		monthlyRequests: { kai: 3_000, basic: 800, pro: 100, frontier: 0 },
		contextTokens: { kai: 32_000, basic: 16_000, pro: 8_000, frontier: 0 },
		maxOutputTokens: { kai: 4_000, basic: 2_000, pro: 2_000, frontier: 0 },
		aiUsageCredits: 4_000,
		chatImports: 1_000,
		importFairUseSoftLimit: null,
		chatUploadsPerDay: 10,
		maxChatUploadBytes: 20 * MB,
		storedFilesBytes: 2 * GB,
		memoryBytes: 100 * MB,
		webSearches: 300,
		webSearchAllModels: true,
		imageGenerations: 50,
		videoGenerationSeconds: 0,
		liveVoiceMinutes: 0,
		kodeBuilds: 0,
		kodeMode: "none",
		canvas: false,
	},
	pro: {
		name: "Pro",
		priceMonthlyCents: 5_999,
		priceAnnualCents: 68_388,
		priceAnnualMonthlyCents: 5_699,
		monthlyRequests: { kai: 5_000, basic: 2_000, pro: 300, frontier: 25 },
		contextTokens: { kai: 64_000, basic: 32_000, pro: 16_000, frontier: 8_000 },
		maxOutputTokens: { kai: 8_000, basic: 4_000, pro: 4_000, frontier: 4_000 },
		aiUsageCredits: 20_000,
		chatImports: null,
		importFairUseSoftLimit: 5_000,
		chatUploadsPerDay: 50,
		maxChatUploadBytes: 50 * MB,
		storedFilesBytes: 10 * GB,
		memoryBytes: 500 * MB,
		webSearches: 1_000,
		webSearchAllModels: true,
		imageGenerations: 200,
		videoGenerationSeconds: 60,
		liveVoiceMinutes: 30,
		kodeBuilds: 25,
		kodeMode: "lite",
		canvas: true,
	},
	max: {
		name: "Max",
		priceMonthlyCents: 14_999,
		priceAnnualCents: 176_388,
		priceAnnualMonthlyCents: 14_699,
		monthlyRequests: { kai: 10_000, basic: 4_000, pro: 700, frontier: 100 },
		contextTokens: {
			kai: 128_000,
			basic: 128_000,
			pro: 64_000,
			frontier: 32_000,
		},
		maxOutputTokens: { kai: 16_000, basic: 8_000, pro: 8_000, frontier: 8_000 },
		aiUsageCredits: 45_000,
		chatImports: null,
		importFairUseSoftLimit: 20_000,
		chatUploadsPerDay: 200,
		maxChatUploadBytes: 100 * MB,
		storedFilesBytes: 100 * GB,
		memoryBytes: 2 * GB,
		webSearches: 3_000,
		webSearchAllModels: true,
		imageGenerations: 500,
		videoGenerationSeconds: 180,
		liveVoiceMinutes: 120,
		kodeBuilds: 100,
		kodeMode: "full",
		canvas: true,
	},
};

export type PlanCardPresentation = {
	description: string;
	cta: string;
	highlighted?: boolean;
};

export const PLAN_CARD_PRESENTATION: Record<PlanTier, PlanCardPresentation> = {
	free: {
		description: "Try K-AI and bring your first conversations with you.",
		cta: "Start free",
	},
	starter: {
		description: "Affordable everyday AI with selected fast models.",
		cta: "Get Starter",
	},
	plus: {
		description: "More models and room for daily work across them.",
		cta: "Get Plus",
		highlighted: true,
	},
	pro: {
		description: "Live, Canvas and Kode Lite for advanced workflows.",
		cta: "Get Pro",
	},
	max: {
		description: "Our highest limits and complete professional toolset.",
		cta: "Get Max",
	},
};

function count(value: number): string {
	return value.toLocaleString("en-US");
}

export function getPlanCardHighlights(tier: PlanTier): string[] {
	const plan = PLAN_DEFINITIONS[tier];
	switch (tier) {
		case "free":
			return [
				`${count(plan.monthlyRequests.kai)} K-AI requests per month`,
				`${count(plan.chatImports ?? 0)} conversation imports per month`,
				`${count(plan.webSearches)} K-AI web searches per month`,
				"512 KB of AI memory",
			];
		case "starter":
			return [
				`${count(plan.monthlyRequests.kai)} K-AI requests per month`,
				`${count(plan.monthlyRequests.basic)} Basic-model requests per month`,
				`${count(plan.aiUsageCredits)} AI usage credits`,
				`${count(plan.imageGenerations)} K-Image generations per month`,
			];
		case "plus":
			return [
				`${count(plan.monthlyRequests.kai)} K-AI requests per month`,
				`${count(plan.monthlyRequests.basic)} Basic + ${count(plan.monthlyRequests.pro)} Pro-model requests`,
				`${count(plan.aiUsageCredits)} AI usage credits`,
				`${count(plan.chatImports ?? 0)} conversation imports per month`,
			];
		case "pro":
			return [
				`${count(plan.monthlyRequests.kai)} K-AI requests per month`,
				"Basic, Pro and Frontier models",
				`${count(plan.aiUsageCredits)} AI usage credits`,
				"Kontinue Live, Canvas and Kode Lite",
			];
		case "max":
			return [
				`${count(plan.monthlyRequests.kai)} K-AI requests per month`,
				"Our highest model and context limits",
				`${count(plan.aiUsageCredits)} AI usage credits`,
				`Full Kode, Canvas and ${plan.liveVoiceMinutes} min of Live`,
			];
	}
}

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
	return PLAN_DEFINITIONS[tier];
}
