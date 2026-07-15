export interface Faq {
	question: string;
	answer: string;
}

export const faqs: Faq[] = [
	{
		question: "What is Kontinue AI?",
		answer:
			"Kontinue AI is an African-built AI platform with K-AI 1.0, access to selected models from leading providers, and technology for importing and continuing supported AI conversations.",
	},
	{
		question: "Does Kontinue AI have its own model?",
		answer:
			"Yes. K-AI 1.0 is Kontinue AI’s native intelligence and orchestration layer. It works with underlying open-source models and Kontinue product capabilities; it is not presented as a foundation model trained from scratch.",
	},
	{
		question: "Can I import conversations from ChatGPT, Claude, or Gemini?",
		answer:
			"Kontinue AI supports public shared-conversation links from ChatGPT, Claude, and Gemini. ChatGPT data-export files are also supported. Provider access controls or page changes can affect shared-link imports.",
	},
	{
		question: "Can I switch models in the same conversation?",
		answer:
			"Yes. You can choose another supported model for the next response while keeping the conversation history in the same thread. Availability depends on your plan.",
	},
	{
		question: "Which models can I use?",
		answer:
			"K-AI 1.0 appears first, alongside selected models from providers including OpenAI, Anthropic, Google, xAI, DeepSeek, Perplexity, Mistral, and others. The catalogue can change.",
	},
	{
		question: "Is there a free plan?",
		answer:
			"Yes. Free includes K-AI 1.0, 10 conversation imports, K-AI web search, and a small AI-memory allowance. Starter, Plus, Pro, and Max add higher limits, more model groups, and additional tools.",
	},
	{
		question: "Is Kontinue AI an African company?",
		answer:
			"Kontinue AI was built in Nigeria and is designed as a global AI platform for users around the world.",
	},
];
