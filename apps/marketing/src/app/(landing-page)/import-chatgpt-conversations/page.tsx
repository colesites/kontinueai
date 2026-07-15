import type { Metadata } from "next";
import { ImportProviderGuide } from "@/components/marketing/ImportProviderGuide";
import { getImportSource } from "@/data/product";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
	title: "Import a ChatGPT Conversation | Kontinue AI",
	description:
		"Import a ChatGPT shared conversation or data export into Kontinue AI and continue with K-AI 1.0 or another supported model.",
	path: "/import-chatgpt-conversations",
});

const source = getImportSource("chatgpt");

export default function ImportChatGptPage() {
	return (
		<ImportProviderGuide
			source={source}
			title="Import a ChatGPT conversation and continue on Kontinue AI"
			description="Use a public ChatGPT shared link for one conversation, or upload conversations.json from a ChatGPT data export for history migration."
			intro="ChatGPT has two verified paths in Kontinue AI. A shared link is the quickest route for one public conversation; conversations.json is designed for a larger account export."
			steps={[
				{
					title: "Choose link or export",
					description:
						"For one conversation, copy its public ChatGPT share URL. For account history, request your ChatGPT data export and locate conversations.json.",
				},
				{
					title: "Paste or upload in Kontinue",
					description:
						"Use the import field for a shared URL, or Settings → Data for the export-file workflow.",
				},
				{
					title: "Review and continue",
					description:
						"Open the prepared conversation, check the imported sequence, and choose K-AI 1.0 or another available model.",
				},
			]}
			troubleshooting={[
				{
					question: "Which ChatGPT link works?",
					answer:
						"Use a publicly reachable shared-conversation link from chatgpt.com or chat.openai.com. Private account URLs cannot be read as shared pages.",
				},
				{
					question: "Which export file should I upload?",
					answer:
						"Upload conversations.json from the official ChatGPT data export. Kontinue’s parser expects that structure.",
				},
				{
					question: "Are attachments guaranteed to transfer?",
					answer:
						"No. Message text and order are the confirmed baseline. Rich content and attachments may not transfer completely.",
				},
				{
					question: "Why did a shared link fail?",
					answer:
						"Confirm the link is public and still opens in a signed-out browser. Provider access controls, page changes, or temporary scraper availability can interrupt extraction.",
				},
			]}
		/>
	);
}
