import type { Metadata } from "next";
import Link from "next/link";
import {
	ContentSection,
	NumberedGrid,
	PageHero,
} from "@/components/marketing/PagePrimitives";
import { product } from "@/data/product";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
	title: "Kontinue AI Security and Privacy",
	description:
		"Learn how Kontinue AI handles conversations, imported chats, model requests, account information and user privacy.",
	path: "/security",
});

export default function SecurityPage() {
	return (
		<>
			<PageHero
				eyebrow="Security and privacy"
				title="A plain-language view of how Kontinue AI handles data."
				description="Here is how we currently handle conversations, imports, model requests, and account data. Our Privacy Policy and Terms of Service remain the governing documents."
				secondary={{
					label: "Read the Privacy Policy",
					href: "/legal/privacy-policy",
				}}
				breadcrumbs={[
					{ name: "Home", href: "/" },
					{ name: "Security", href: "/security" },
				]}
			/>

			<ContentSection
				eyebrow="Conversations"
				title="Stored so the product can keep your work together"
				description="We store chats and messages under your account identifier in our Convex backend. Conversation records include message content, order, timestamps, and model metadata where applicable."
			>
				<NumberedGrid
					items={[
						{
							title: "Account security",
							description:
								"Authentication is provided through Clerk, with authenticated application routes checked on the server.",
						},
						{
							title: "Model requests",
							description:
								"When you choose an external model, prompts and relevant conversation context are sent to the corresponding AI service path to produce a response.",
						},
						{
							title: "Monitoring",
							description:
								"We use operational services including Vercel Analytics and Sentry. We do not add private conversation content to marketing analytics events.",
						},
					]}
				/>
			</ContentSection>

			<ContentSection
				tone="muted"
				eyebrow="Imports"
				title="Different methods use different processing paths"
				description="For shared-link imports, we retrieve the public conversation page through our scraper or configured extraction service. For export files, we use temporary object storage, parse supported messages, and remove the raw upload. We also clean up prepared import data after processing."
			>
				<p className="mt-8 max-w-3xl leading-relaxed text-muted-foreground">
					We associate imported messages with your Kontinue AI account.
					Unsupported rich content can be omitted. We do not need your
					source-platform password for public shared-link imports.
				</p>
			</ContentSection>

			<ContentSection
				tone="dark"
				eyebrow="Training and providers"
				title="How we handle training and providers"
				description="We do not use personal conversations or imported chat data to train AI models. When you choose a third-party model, we send the prompt and relevant context to that provider to generate a response. Each external provider has its own terms and privacy practices."
			/>

			<ContentSection
				eyebrow="Your controls"
				title="Export, disconnect, and request deletion"
			>
				<NumberedGrid
					items={[
						{
							title: "Export",
							description:
								"You can export conversations, memories, summaries, and account metadata in JSON, Markdown, or ZIP formats.",
						},
						{
							title: "Connected accounts",
							description:
								"Available connectors can be disconnected from Settings. Provider permissions can also be revoked at the provider.",
						},
						{
							title: "Deletion",
							description: `Send account and associated-data deletion requests to ${product.company.email.privacy}. We do not currently offer self-service account deletion.`,
						},
					]}
				/>
			</ContentSection>

			<ContentSection
				tone="muted"
				eyebrow="Retention and limitations"
				title="No unsupported certification claims"
				description="We retain personal information for as long as necessary to provide the service and fulfil the purposes in our Privacy Policy, unless the law requires longer. We have not published a universal deletion deadline, and we do not claim end-to-end encryption, zero retention, SOC 2 certification, or universal regulatory compliance."
			>
				<div className="mt-8 flex flex-wrap gap-5 text-sm">
					<Link
						href="/legal/privacy-policy"
						className="link-underline font-medium text-brand-strong"
					>
						Privacy Policy
					</Link>
					<Link
						href="/legal/terms-of-service"
						className="link-underline font-medium text-brand-strong"
					>
						Terms of Service
					</Link>
					<a
						href={`mailto:${product.company.email.privacy}`}
						className="link-underline font-medium text-brand-strong"
					>
						Contact privacy
					</a>
				</div>
			</ContentSection>
		</>
	);
}
