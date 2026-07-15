import type { Metadata } from "next";
import { ImportProviderGuide } from "@/components/marketing/ImportProviderGuide";
import { getImportSource } from "@/data/product";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
	title: "Import a Gemini Conversation | Kontinue AI",
	description:
		"Import a publicly shared Gemini conversation into Kontinue AI and continue its extracted message context with another supported model.",
	path: "/import-gemini-conversations",
});

const source = getImportSource("gemini");

export default function ImportGeminiPage() {
	return (
		<ImportProviderGuide
			source={source}
			title="Import a Gemini conversation and continue with another AI model"
			description="Bring a publicly shared Gemini conversation into Kontinue AI, keep the extracted message sequence, and choose K-AI 1.0 or another supported option."
			intro="Gemini imports use a public shared link. Kontinue detects Gemini and Google AI Studio share URLs, extracts supported message content, and creates a conversation under your account."
			steps={[
				{
					title: "Create a Gemini share link",
					description:
						"Share the relevant Gemini conversation and confirm the resulting page is publicly reachable.",
				},
				{
					title: "Import it in Kontinue",
					description:
						"Paste the share URL into Kontinue AI’s import field. Kontinue identifies the source and begins extraction.",
				},
				{
					title: "Continue from the message sequence",
					description:
						"Review what transferred, select K-AI 1.0 or another available model, and send the next prompt.",
				},
			]}
			troubleshooting={[
				{
					question: "Which Gemini URLs are recognised?",
					answer:
						"The importer recognises supported gemini.google.com and Google AI Studio share URLs. The page still needs to be publicly reachable.",
				},
				{
					question: "Does it copy every Gemini feature?",
					answer:
						"No. Extracted message text and order are the baseline. Rich cards, files, citations, or interactive elements may not transfer fully.",
				},
				{
					question: "Why is the imported conversation empty?",
					answer:
						"The shared page may be private, expired, changed by the provider, or structured in a way the current extractor cannot read.",
				},
				{
					question: "Can I return to Gemini later?",
					answer:
						"The original share page remains controlled by Google. The imported Kontinue copy becomes a separate conversation you can continue with supported models.",
				},
			]}
		/>
	);
}
