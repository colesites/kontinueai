import {
	getPlanCardHighlights,
	PLAN_CARD_PRESENTATION,
	PLAN_DEFINITIONS,
} from "@repo/core/plan-config";
import {
	getImportUploadLimitBytes,
	PLAN_TIERS,
	type PlanTier,
} from "@repo/core/plan-tier";

export type ProductPlanId = PlanTier;

export type KodeAccess = "Not included" | "Kode Lite" | "Full Kode";

export interface ProductPlan {
	id: ProductPlanId;
	name: string;
	monthlyPriceUsd: number;
	annualPriceUsd: number;
	annualMonthlyPriceUsd: number;
	description: string;
	cta: string;
	highlighted?: boolean;
	limits: {
		kaiRequests: number | null;
		basicModelRequests: number;
		proModelRequests: number;
		frontierModelRequests: number;
		aiUsageCredits: number;
		automaticImports: number | null;
		importFairUseCap: number | null;
		importUploadBytes: number;
		realtimeVoiceMinutes: number;
		webSearches: number;
		webSearchAvailability: "K-AI only" | "All available models";
		kImageGenerations: number;
		kVideoSeconds: number;
		chatFileUploadsPerDay: number;
		maxChatFileBytes: number;
		storedFileBytes: number;
		memoryBytes: number;
		kodeBuilds: number;
		kodeAccess: KodeAccess;
		canvas: boolean;
	};
	features: string[];
}

export interface SupportedModelGroup {
	id: string;
	displayName: string;
	provider: string;
	category: "Kontinue native" | "External provider";
	bestSuitedFor: string;
	availability: string;
	planRequirement: string;
	status: "Available";
	lastReviewed: string;
	logo?: string;
}

export interface ImportSource {
	id: "chatgpt" | "claude" | "gemini" | "perplexity" | "kontinue";
	name: string;
	status: "Available";
	methods: Array<"Shared conversation link" | "Data export file">;
	preserves: string[];
	limitations: string;
	guidePath?: string;
	logo?: string;
}

export const product = {
	company: {
		name: "Kontinue AI",
		website: "https://kontinueai.com",
		appUrl: "https://chat.kontinueai.com",
		productCategory: "AI platform and AI assistant",
		founder: {
			name: "Aderibigbe Adedamola",
			role: "Founder",
			bio: null,
		},
		countryOfOrigin: "Nigeria",
		originStatement: "Built in Africa for the world",
		market: "Global",
		foundedDate: null,
		headquarters: null,
		email: {
			general: "hello@kontinueai.com",
			support: "support@kontinueai.com",
			press: "support@kontinueai.com",
			privacy: "privacy@kontinueai.com",
			legal: "legal@kontinueai.com",
		},
		socialLinks: [
			{ name: "X", href: "https://x.com/kontinueai", icon: "/x.svg" },
			{
				name: "Instagram",
				href: "https://www.instagram.com/kontinueai/",
				icon: "/instagram-icon.svg",
			},
			{
				name: "TikTok",
				href: "https://www.tiktok.com/@kontinue_ai",
				icon: "/tiktok-icon-light.svg",
			},
		],
	},
	positioning: {
		short:
			"Kontinue AI is an African-built AI platform with its own native intelligence layer, access to leading AI models, and technology for importing and continuing AI conversations.",
		long: "Kontinue AI is an AI platform and assistant built in Nigeria for users around the world. K-AI 1.0, Kontinue AI’s native intelligence layer, sits alongside supported models from leading providers. Users can import existing AI conversations, preserve the available message context, and continue with the model that fits their work.",
	},
	nativeModel: {
		name: "K-AI 1.0",
		version: "1.0",
		releaseDate: "1 June 2026",
		description:
			"Kontinue AI’s proprietary intelligence and orchestration layer, available as the native option inside the platform.",
		transparency:
			"We built K-AI 1.0 as an orchestration layer that works with underlying open-source models and Kontinue product capabilities such as memory, retrieval, projects, tasks, connectors, and specialised agents. We do not present it as a foundation model trained from scratch.",
		supportedTasks: [
			"Everyday questions",
			"Writing and rewriting",
			"Brainstorming",
			"Summarisation",
			"Research assistance",
			"Reasoning",
			"Coding assistance",
		],
		supportedLanguages:
			"More than 140 languages through the primary Gemma 4 runtime",
		primaryLanguageModel: "Gemma 4 31B Instruct",
		fallbackLanguageModel: "gpt-oss-120b",
		primaryModelCard: "https://ai.google.dev/gemma/docs/core/model_card_4",
		publishedBenchmarks: [
			{ name: "MMLU Pro", score: "85.2%" },
			{ name: "AIME 2026 · no tools", score: "89.2%" },
			{ name: "LiveCodeBench v6", score: "80.0%" },
			{ name: "GPQA Diamond", score: "84.3%" },
		],
		knownLimitations: [
			"Responses can be incomplete or incorrect and should be checked for important decisions.",
			"Availability and underlying routing can change as the product evolves.",
			"Published Gemma 4 results measure the base model, not the complete K-AI experience with Kontinue tools, memory, retrieval, and routing.",
		],
		dataAndPrivacy:
			"We handle conversations under our Privacy Policy. We do not use personal conversations or imported chat data to train AI models.",
	},
} as const;

function productPlan(id: ProductPlanId): ProductPlan {
	const definition = PLAN_DEFINITIONS[id];
	const copy = PLAN_CARD_PRESENTATION[id];
	return {
		id,
		name: definition.name,
		monthlyPriceUsd: definition.priceMonthlyCents / 100,
		annualPriceUsd: definition.priceAnnualCents / 100,
		annualMonthlyPriceUsd: definition.priceAnnualMonthlyCents / 100,
		...copy,
		features: getPlanCardHighlights(id),
		limits: {
			kaiRequests: definition.monthlyRequests.kai,
			basicModelRequests: definition.monthlyRequests.basic,
			proModelRequests: definition.monthlyRequests.pro,
			frontierModelRequests: definition.monthlyRequests.frontier,
			aiUsageCredits: definition.aiUsageCredits,
			automaticImports: definition.chatImports,
			importFairUseCap: definition.importFairUseSoftLimit,
			importUploadBytes: getImportUploadLimitBytes(id),
			realtimeVoiceMinutes: definition.liveVoiceMinutes,
			webSearches: definition.webSearches,
			webSearchAvailability: definition.webSearchAllModels
				? "All available models"
				: "K-AI only",
			kImageGenerations: definition.imageGenerations,
			kVideoSeconds: definition.videoGenerationSeconds,
			chatFileUploadsPerDay: definition.chatUploadsPerDay,
			maxChatFileBytes: definition.maxChatUploadBytes,
			storedFileBytes: definition.storedFilesBytes,
			memoryBytes: definition.memoryBytes,
			kodeBuilds: definition.kodeBuilds,
			kodeAccess:
				definition.kodeMode === "none"
					? "Not included"
					: definition.kodeMode === "lite"
						? "Kode Lite"
						: "Full Kode",
			canvas: definition.canvas,
		},
	};
}

export const plans: ProductPlan[] = PLAN_TIERS.map(productPlan);

export const importSources: ImportSource[] = [
	{
		id: "chatgpt",
		name: "ChatGPT",
		status: "Available",
		methods: ["Shared conversation link", "Data export file"],
		preserves: ["Message text", "Speaker order", "Conversation sequence"],
		limitations:
			"Data-export imports use conversations.json. Content types beyond supported message text may not transfer completely.",
		guidePath: "/import-chatgpt-conversations",
		logo: "/openai.svg",
	},
	{
		id: "claude",
		name: "Claude",
		status: "Available",
		methods: ["Shared conversation link"],
		preserves: [
			"Extracted message text",
			"Speaker order",
			"Conversation sequence",
		],
		limitations:
			"The shared page must be publicly reachable. Provider page changes or access controls can prevent extraction.",
		guidePath: "/import-claude-conversations",
		logo: "/claude-ai-icon.svg",
	},
	{
		id: "gemini",
		name: "Gemini",
		status: "Available",
		methods: ["Shared conversation link"],
		preserves: [
			"Extracted message text",
			"Speaker order",
			"Conversation sequence",
		],
		limitations:
			"The shared page must be publicly reachable. Some rich content may not transfer with the text conversation.",
		guidePath: "/import-gemini-conversations",
		logo: "/gemini.svg",
	},
	{
		id: "perplexity",
		name: "Perplexity",
		status: "Available",
		methods: ["Shared conversation link"],
		preserves: [
			"Extracted questions",
			"Extracted answers",
			"Conversation sequence",
		],
		limitations:
			"The shared page must be publicly reachable. Source presentation and rich content can vary by page.",
		logo: "/perplexity.svg",
	},
	{
		id: "kontinue",
		name: "Kontinue AI",
		status: "Available",
		methods: ["Data export file"],
		preserves: ["Message text", "Speaker order", "Conversation sequence"],
		limitations: "Use a JSON export previously created in Kontinue AI.",
		logo: "/kontinueai-icon.png",
	},
];

export const supportedModelGroups: SupportedModelGroup[] = [
	{
		id: "kai",
		displayName: "K-AI 1.0",
		provider: "Kontinue AI",
		category: "Kontinue native",
		bestSuitedFor:
			"Everyday work, writing, research assistance, reasoning, and coding support",
		availability: "Available as the default native option",
		planRequirement: "All plans; request limits vary",
		status: "Available",
		lastReviewed: "2026-07-14",
		logo: "/kontinueai-icon.png",
	},
	...[
		["openai", "OpenAI models", "OpenAI", "/openai.svg"],
		["anthropic", "Claude models", "Anthropic", "/claude-ai-icon.svg"],
		["google", "Gemini models", "Google", "/gemini.svg"],
		["xai", "Grok models", "xAI", "/grok-light.svg"],
		["deepseek", "DeepSeek models", "DeepSeek", undefined],
		["perplexity", "Perplexity models", "Perplexity", "/perplexity.svg"],
		["minimax", "MiniMax models", "MiniMax", undefined],
		["zai", "Z.ai models", "Z.ai", undefined],
		["alibaba", "Qwen and Alibaba models", "Alibaba", "/qwen_light.svg"],
		["moonshot", "Moonshot AI models", "Moonshot AI", undefined],
		["mistral", "Mistral models", "Mistral", "/mistral-ai_logo.svg"],
	].map(([id, displayName, provider, logo]) => ({
		id: id as string,
		displayName: displayName as string,
		provider: provider as string,
		category: "External provider" as const,
		bestSuitedFor: "Varies by the selected model and provider",
		availability: "Selected models; the catalogue can change",
		planRequirement: "Availability depends on model and plan",
		status: "Available" as const,
		lastReviewed: "2026-07-14",
		...(logo ? { logo: logo as string } : {}),
	})),
];

export const blogCategories = [
	"Product",
	"Engineering",
	"AI Models",
	"Tutorials",
	"Research",
	"Company",
] as const;

export const appLinks = {
	signUp: `${product.company.appUrl}/sign-up`,
	signIn: `${product.company.appUrl}/sign-in`,
	import: product.company.appUrl,
	pricing: `${product.company.appUrl}/pricing`,
} as const;

export function getImportSource(id: ImportSource["id"]): ImportSource {
	const source = importSources.find((item) => item.id === id);
	if (!source) {
		throw new Error(`Import source configuration is missing: ${id}`);
	}
	return source;
}

export function formatUsd(value: number): string {
	return value === 0 ? "$0" : `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

export function formatFileSize(bytes: number): string {
	if (bytes >= 1024 * 1024 * 1024) {
		return `${bytes / (1024 * 1024 * 1024)} GB`;
	}
	return `${bytes / (1024 * 1024)} MB`;
}
