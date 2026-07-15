import type { Metadata } from "next";
import { ImportProviderGuide } from "@/components/marketing/ImportProviderGuide";
import { getImportSource } from "@/data/product";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
	title: "Import a Claude Conversation | Kontinue AI",
	description:
		"Move a publicly shared Claude conversation into Kontinue AI and continue from the extracted message context with a supported model.",
	path: "/import-claude-conversations",
});

const source = getImportSource("claude");

export default function ImportClaudePage() {
	return (
		<ImportProviderGuide
			source={source}
			title="Move a Claude conversation to Kontinue AI without rebuilding the thread"
			description="Paste a publicly reachable Claude shared-conversation link, prepare the extracted message sequence, and choose the model for what comes next."
			intro="Claude imports currently use the shared-link workflow. Kontinue routes anti-bot protected pages through its configured extraction service, so a public share page is required."
			steps={[
				{
					title: "Share the Claude conversation",
					description:
						"Create a public share link in Claude and confirm it opens without your signed-in session.",
				},
				{
					title: "Paste the link",
					description:
						"Open Kontinue AI, paste the Claude URL into the import field, and start the import.",
				},
				{
					title: "Inspect the extracted thread",
					description:
						"Check the imported messages, then continue with K-AI 1.0 or another model available on your plan.",
				},
			]}
			troubleshooting={[
				{
					question: "Does Kontinue support a Claude export file?",
					answer:
						"The verified public workflow is a shared-conversation link. A Claude export-file workflow is not currently published.",
				},
				{
					question: "Why must the link be public?",
					answer:
						"Kontinue’s importer needs to retrieve the shared page. It cannot use your private Claude session or credentials.",
				},
				{
					question: "What may be missing?",
					answer:
						"The importer targets the conversation’s message content and order. Artifacts, files, and provider-specific interactive elements may not transfer completely.",
				},
				{
					question: "Can I use a different model after importing?",
					answer:
						"Yes. Choose K-AI 1.0 or another supported model available on your plan for the next response.",
				},
			]}
		/>
	);
}
