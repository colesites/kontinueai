export interface Faq {
	question: string;
	answer: string;
}

export const faqs: Faq[] = [
	{
		question: "What happens when I hit a limit on Claude or ChatGPT?",
		answer:
			"Share the conversation, paste the link into Kontinue AI and send your next message. The chat comes over with its messages in order, so you can keep going without waiting for a reset.",
	},
	{
		question: "What is Kontinue AI?",
		answer:
			"Kontinue AI is where you continue AI conversations when you hit a limit. It imports chats from ChatGPT, Claude and Gemini and lets you keep going on K-AI 1.0 or selected models from leading providers.",
	},
	{
		question: "Does the full context come with the chat?",
		answer:
			"Kontinue AI imports the messages included in the shared conversation, in order. Files, images or tool output that the provider leaves out of a share may not come across.",
	},
	{
		question: "Does Kontinue AI have its own model?",
		answer:
			"Yes. K-AI 1.0 is Kontinue AI’s native intelligence and orchestration layer. It works with underlying open-source models and Kontinue product capabilities. It is not presented as a foundation model trained from scratch.",
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
];
