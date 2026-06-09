export interface UseCase {
	id: string;
	title: string;
	description: string;
}

export const useCases: UseCase[] = [
	{
		id: "out-of-tokens",
		title: "Out of tokens / message limits",
		description:
			"Hit a limit on one platform, import your chat to Kontinue AI and continue.",
	},
	{
		id: "hallucinations",
		title: "AI hallucinations",
		description:
			"If a model is misbehaving, simply switch to another one instantly to verify and continue your flow.",
	},
	{
		id: "best-model",
		title: '"This model is good at X"',
		description:
			"Customise your workflow by using the right model for every task - from coding to creative writing.",
	},
	{
		id: "study-assignments",
		title: "Study & assignments",
		description:
			"Pick up exactly where you left off. Import your learning sessions and use more powerful models to master complex topics.",
	},
];
