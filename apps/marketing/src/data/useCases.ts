export interface UseCase {
	id: string;
	index: string;
	title: string;
	description: string;
}

export const useCases: UseCase[] = [
	{
		id: "out-of-tokens",
		index: "01",
		title: "You hit the message limit",
		description:
			"Run out of messages on one app? Import the conversation into Kontinue AI and keep going on another model. No copy and paste, no lost thread.",
	},
	{
		id: "hallucinations",
		index: "02",
		title: "A model gets it wrong",
		description:
			"When an answer looks off, send the same chat to a different model and compare. Two opinions, one conversation, no second tab.",
	},
	{
		id: "best-model",
		index: "03",
		title: "The right model for the job",
		description:
			"Use one model for writing, another for reasoning, another for research. Pick what fits each task while everything stays in one history.",
	},
	{
		id: "study-assignments",
		index: "04",
		title: "Study and assignments",
		description:
			"Pick up exactly where you left off. Bring a study session in and move to a stronger model when the topic gets hard.",
	},
];
