export interface UseCase {
	id: string;
	index: string;
	title: string;
	description: string;
}

export const marketingScenarios: UseCase[] = [
	{
		id: "out-of-tokens",
		index: "01",
		title: "You hit the message limit",
		description:
			"Run out of messages on one app? Import a supported conversation into Kontinue AI and keep working with the available message context.",
	},
	{
		id: "hallucinations",
		index: "02",
		title: "A model gets it wrong",
		description:
			"When an answer needs a second perspective, choose another supported model for the next response while keeping the thread together.",
	},
	{
		id: "best-model",
		index: "03",
		title: "The right model for the job",
		description:
			"Use K-AI 1.0 for everyday work, then choose another supported model when its capabilities better match the task.",
	},
	{
		id: "study-assignments",
		index: "04",
		title: "Study and assignments",
		description:
			"Bring in a supported study conversation, keep its message sequence, and continue with the model you choose.",
	},
];
