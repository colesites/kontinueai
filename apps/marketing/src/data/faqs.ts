export interface Faq {
	question: string;
	answer: string;
}

export const faqs: Faq[] = [
	{
		question: "Can I import chats from ChatGPT, Claude and Gemini?",
		answer:
			"Yes. Bring conversations from the major AI apps into Kontinue AI and continue them in one place. Your messages and context come across so you do not start over.",
	},
	{
		question: "Do I need a separate subscription for each model?",
		answer:
			"No. One Kontinue AI plan gives you access to many models, so you can stop paying for several apps at once.",
	},
	{
		question: "What happens to my context when I switch models?",
		answer:
			"Your context carries over. Continue the same thread on a different model and it picks up where the last one left off, with no reset.",
	},
	{
		question: "How does Kontinue AI help when a model is wrong?",
		answer:
			"Send the same question to another model and compare answers side by side in the same conversation. It is the fastest way to catch a mistake.",
	},
	{
		question: "Which models can I use?",
		answer:
			"Kontinue AI supports models from OpenAI, Anthropic, Google, xAI, Meta, Mistral, Perplexity and more, with new ones added over time.",
	},
	{
		question: "Is there a free plan?",
		answer:
			"Yes. The Free plan lets you try the workspace with a limited number of chats and imports. Upgrade to Starter or Pro for higher limits and more models.",
	},
];
