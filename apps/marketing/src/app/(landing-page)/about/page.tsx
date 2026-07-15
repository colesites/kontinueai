import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/marketing/JsonLd";
import {
	ContentSection,
	NumberedGrid,
	PageHero,
	ProductCTA,
} from "@/components/marketing/PagePrimitives";
import { product } from "@/data/product";
import { pageMetadata } from "@/lib/metadata";
import { founderSchema, organizationSchema } from "@/lib/structured-data";

export const metadata: Metadata = pageMetadata({
	title: "About Kontinue AI | An African-Built AI Platform",
	description:
		"Learn how Kontinue AI is building a global AI platform from Africa with K-AI 1.0, leading external models and portable AI conversations.",
	path: "/about",
});

const facts = [
	["Company", product.company.name],
	["Product category", product.company.productCategory],
	["Founder", product.company.founder.name],
	["Country of origin", product.company.countryOfOrigin],
	["Market", product.company.market],
	["Website", product.company.website],
];

export default function AboutPage() {
	return (
		<>
			<JsonLd
				data={[
					organizationSchema,
					{ "@context": "https://schema.org", ...founderSchema },
				]}
			/>
			<PageHero
				eyebrow="About Kontinue AI"
				title="Building a global AI platform from Africa."
				description="Kontinue AI is an African-built AI platform that combines K-AI 1.0, access to leading external models, and conversation-import technology in one product."
				primary={{
					label: "Start free",
					href: "https://chat.kontinueai.com/sign-up",
					eventName: "about_signup_clicked",
				}}
				secondary={{ label: "Read the journal", href: "/blog" }}
				breadcrumbs={[
					{ name: "Home", href: "/" },
					{ name: "About", href: "/about" },
				]}
			/>

			<ContentSection
				eyebrow="The product"
				title="An AI platform, not just a model directory"
				description={product.positioning.long}
			>
				<NumberedGrid
					items={[
						{
							title: "Native intelligence",
							description:
								"K-AI 1.0 gives Kontinue AI a native intelligence experience rather than depending only on third-party model names.",
						},
						{
							title: "Portable conversations",
							description:
								"Supported imports let people continue useful work without manually reconstructing the available message history.",
						},
						{
							title: "Model choice",
							description:
								"Selected external models remain available when a different capability or provider fits the next part of the work.",
						},
					]}
				/>
			</ContentSection>

			<ContentSection
				tone="muted"
				eyebrow="Why it was created"
				title="AI work should survive the app it started in"
				description="People increasingly use several AI products, but their project history remains fragmented. Kontinue AI treats the conversation as something users should be able to bring forward, while building a native Kontinue experience around that portability."
			/>

			<ContentSection
				eyebrow="Built in Nigeria"
				title="African origin. Global ambition."
				description="Kontinue AI is an African-built AI platform created in Nigeria and designed for users around the world. Its origin is part of the company’s identity, not a limit on who the product is for."
			/>

			<ContentSection
				tone="dark"
				eyebrow="Founder"
				title={product.company.founder.name}
				description="Founder of Kontinue AI. We will publish a longer biography when more official details are ready."
			>
				<Link
					href="/authors/aderibigbe-adedamola"
					className="link-underline mt-8 inline-block font-medium text-background"
				>
					View founder and author profile
				</Link>
			</ContentSection>

			<ContentSection eyebrow="Company facts" title="Kontinue AI at a glance">
				<dl className="mt-12 grid gap-px overflow-hidden rounded-[1.4rem] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
					{facts.map(([label, value]) => (
						<div key={label} className="bg-card p-6">
							<dt className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
								{label}
							</dt>
							<dd className="mt-3 font-display text-lg">{value}</dd>
						</div>
					))}
				</dl>
				<div className="mt-8 flex flex-wrap gap-5 text-sm">
					<Link
						href="/press"
						className="link-underline font-medium text-brand-strong"
					>
						Press and company assets
					</Link>
					<a
						href={`mailto:${product.company.email.support}`}
						className="link-underline font-medium text-brand-strong"
					>
						Contact Kontinue AI
					</a>
				</div>
			</ContentSection>

			<ProductCTA
				title="Use an AI platform built in Africa for the world."
				description="Start with K-AI 1.0, import supported conversations, and keep your choice of leading models."
				eventName="about_final_signup_clicked"
			/>
		</>
	);
}
