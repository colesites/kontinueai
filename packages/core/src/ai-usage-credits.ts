import type { ModelAccessClass } from "./model-pricing";

export const AI_USAGE_CREDIT_COSTS = {
	chatRequest: {
		basic: 1,
		pro: 6,
		frontier: 25,
	} satisfies Record<ModelAccessClass, number>,
	webSearch: 4,
	imageGeneration: 20,
	videoGenerationPerSecond: 15,
	liveVoicePerSecond: 2,
	kodeCredit: 25,
} as const;

export function getChatRequestCreditCost(modelClass: ModelAccessClass): number {
	return AI_USAGE_CREDIT_COSTS.chatRequest[modelClass];
}
