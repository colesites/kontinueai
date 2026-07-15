import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
	ContentSection,
	FAQList,
	NumberedGrid,
	PageHero,
	ProductCTA,
} from "@/components/marketing/PagePrimitives";
import { appLinks, importSources } from "@/data/product";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
	title: "Import AI Conversations and Continue Them | Kontinue AI",
	description:
		"Import supported AI conversations into Kontinue AI, preserve the available context and continue with K-AI 1.0 or another leading model.",
	path: "/import-ai-conversations",
});

const faqs = [
	{
		question: "Can I import a ChatGPT conversation?",
		answer:
			"Yes. We support public ChatGPT shared links and conversations.json files from a ChatGPT data export.",
	},
	{
		question: "Can I import a Claude conversation?",
		answer:
			"Yes. A publicly reachable Claude shared-conversation link can be imported. Provider access controls or page changes can affect extraction.",
	},
	{
		question: "Can I import a Gemini conversation?",
		answer:
			"Yes. We support publicly reachable Gemini shared-conversation links. Some rich content may not transfer with the text conversation.",
	},
	{
		question: "Can I choose a different model after importing?",
		answer:
			"Yes. After the conversation is ready, choose K-AI 1.0 or another supported model available on your plan.",
	},
	{
		question: "Will my previous messages remain visible?",
		answer:
			"Supported extracted messages are inserted into the Kontinue conversation in sequence. Unsupported or inaccessible content may be omitted.",
	},
	{
		question: "Is importing free?",
		answer:
			"The Free plan currently includes 10 automatic shared-link imports per month and a ChatGPT export-file upload allowance up to 500 MB.",
	},
	{
		question: "Is my imported conversation private?",
		answer:
			"We associate imported conversations with your account. Read our Security and Privacy page and Privacy Policy for details about handling, providers, analytics, and retention.",
	},
];

export default function ImportConversationsPage() {
	return (
		<>
			<PageHero
				eyebrow="Conversation portability"
				title="Import your AI conversations and continue without starting over."
				description="Move supported conversations into Kontinue AI, preserve the available message context, and continue with K-AI 1.0 or another supported model."
				primary={{
					label: "Import a conversation",
					href: appLinks.import,
					eventName: "import_page_cta_clicked",
				}}
				secondary={{ label: "Review privacy", href: "/security" }}
				breadcrumbs={[
					{ name: "Home", href: "/" },
					{ name: "Import conversations", href: "/import-ai-conversations" },
				]}
			/>

			<ContentSection
				eyebrow="Why it matters"
				title="Context loss turns progress into repeated work"
				description="Message limits, model changes, and fragmented tools can leave useful conversations behind. Portability lets you bring supported conversation history forward instead of manually recreating the thread."
			>
				<NumberedGrid
					items={[
						{
							title: "Continue after a limit",
							description:
								"Move a supported shared conversation into Kontinue AI and choose an available model for the next response.",
						},
						{
							title: "Change the model",
							description:
								"Keep the thread together while selecting a model whose capabilities better fit the next task.",
						},
						{
							title: "Keep projects coherent",
							description:
								"Resume research, coding assistance, study sessions, and long-running work from the available message sequence.",
						},
					]}
				/>
			</ContentSection>

			<ContentSection
				tone="muted"
				eyebrow="How it works"
				title="Three steps from source to continuation"
			>
				<NumberedGrid
					items={[
						{
							title: "Copy the shared link",
							description:
								"Open the conversation in a supported AI platform, click Share, and copy the public conversation link.",
						},
						{
							title: "Import your conversation",
							description:
								"Paste the shared link into Kontinue AI. We extract supported messages and prepare them in their original order.",
						},
						{
							title: "Continue with the right model",
							description:
								"Choose K-AI 1.0 or another supported model available on your plan, then keep working in the imported thread.",
						},
					]}
				/>
			</ContentSection>

			<ContentSection
				eyebrow="Supported sources"
				title="Supported import methods in one place"
				description="Our support differs by source. Shared links must be publicly reachable, and export formats must match the required file structure."
			>
				<div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
					{importSources.map((source) => (
						<article
							key={source.id}
							className="rounded-[1.4rem] border border-border bg-card p-7"
						>
							<div className="flex items-center gap-3">
								{source.logo ? (
									<Image
										src={source.logo}
										alt=""
										width={28}
										height={28}
										className="size-7 object-contain"
									/>
								) : null}
								<h3 className="font-display text-xl">{source.name}</h3>
								<span className="ml-auto rounded-full bg-brand-tint px-2.5 py-1 text-[10px] font-semibold text-brand-strong">
									{source.status}
								</span>
							</div>
							<p className="mt-5 text-sm leading-relaxed text-muted-foreground">
								{source.methods.join(" · ")}
							</p>
							{source.guidePath ? (
								<Link
									href={source.guidePath}
									className="link-underline mt-6 inline-block text-sm font-medium text-brand-strong"
								>
									Read the {source.name} guide
								</Link>
							) : null}
						</article>
					))}
				</div>
			</ContentSection>

			<ContentSection
				tone="dark"
				eyebrow="Privacy"
				title="Imported content is still your data"
				description="We associate imports with your account. We process raw file uploads through temporary object storage and remove them after parsing, then remove prepared import data after processing. For shared links, we use Kontinue’s scraper path or Firecrawl depending on the source. Under our Privacy Policy, we do not use personal conversations or imported chat data to train AI models."
			>
				<div className="mt-8 flex flex-wrap gap-5 text-sm">
					<Link href="/security" className="link-underline text-background">
						Read the plain-language security overview
					</Link>
					<Link
						href="/legal/privacy-policy"
						className="link-underline text-background"
					>
						Read the Privacy Policy
					</Link>
				</div>
			</ContentSection>

			<FAQList items={faqs} centered />
			<ProductCTA
				title="Start free and import your first supported conversation."
				description="Bring the available context forward, then choose the model that fits the next step."
				eventName="import_page_signup_clicked"
			/>
		</>
	);
}
