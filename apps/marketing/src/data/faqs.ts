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
		question: "Does the full context come with the chat?",
		answer:
			"Kontinue AI imports the messages included in the shared conversation, in order. Files, images or tool output that the provider leaves out of a share may not come across.",
	},
	{
		question: "Which apps can I import conversations from?",
		answer:
			"Kontinue AI supports public shared-conversation links from ChatGPT, Claude, and Gemini. ChatGPT data-export files are also supported. Provider access controls or page changes can affect shared-link imports.",
	},
	{
		question: "Which models can I use, and can I switch mid-conversation?",
		answer:
			"K-AI 1.0 comes first, alongside selected models from providers including OpenAI, Anthropic, Google, xAI, DeepSeek, Perplexity, Mistral, and others. You can choose a different model for the next reply while the history stays in the same thread. Availability depends on your plan and the catalogue can change.",
	},
	{
		question: "Does Kontinue AI have its own model?",
		answer:
			"Yes. K-AI 1.0 is Kontinue AI’s native intelligence and orchestration layer. It works with underlying open-source models and Kontinue product capabilities. It is not presented as a foundation model trained from scratch.",
	},
	{
		question: "Is there a desktop or mobile app?",
		answer:
			"Kontinue AI runs in any modern browser today. Apps for desktop, iPhone, iPad and Android are in development. Leave your email on the download page and we will let you know when they launch.",
	},
	{
		question: "Is there a free plan?",
		answer:
			"Yes. Free includes K-AI 1.0, 10 conversation imports, K-AI web search, and a small AI-memory allowance. Starter, Plus, Pro, and Max add higher limits, more model groups, and additional tools.",
	},
];
