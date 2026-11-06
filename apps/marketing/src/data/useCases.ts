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
			"ChatGPT or Claude says come back later? Bring the chat to Kontinue AI and finish now, with the whole conversation in place.",
	},
	{
		id: "hallucinations",
		index: "02",
		title: "A model gets it wrong",
		description:
			"When an answer looks off, ask another model for the next reply without leaving the thread.",
	},
	{
		id: "best-model",
		index: "03",
		title: "The right model for the job",
		description:
			"Use K-AI 1.0 for everyday work and switch to another model when the task calls for it.",
	},
	{
		id: "study-assignments",
		index: "04",
		title: "Study and assignments",
		description:
			"Out of messages halfway through an assignment? Import the study chat and keep working with everything it already covers.",
	},
];
