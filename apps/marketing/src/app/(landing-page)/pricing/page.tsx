import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/marketing/JsonLd";
import {
	ContentSection,
	PageHero,
} from "@/components/marketing/PagePrimitives";
import { PricingComparison } from "@/components/marketing/PricingComparison";
import { PricingPlanGrid } from "@/components/sections/PricingPlanGrid";
import { pricingTiers } from "@/data/pricing";
import { pageMetadata } from "@/lib/metadata";
import { softwareSchema } from "@/lib/structured-data";

export const metadata: Metadata = pageMetadata({
	title: "Kontinue AI Pricing | One Platform for Multiple AI Models",
	description:
		"Compare Kontinue AI plans, use K-AI 1.0, access supported leading models and import existing AI conversations.",
	path: "/pricing",
});

export default function PricingPage() {
	return (
		<>
			<JsonLd data={softwareSchema} />
			<PageHero
				eyebrow="Pricing"
				title="Clear limits. No mystery checkmarks."
				description="Every plan starts with K-AI 1.0. Compare exact model requests, context, imports, storage, search, creative tools and AI usage credits before you choose."
				breadcrumbs={[
					{ name: "Home", href: "/" },
					{ name: "Pricing", href: "/pricing" },
				]}
			/>

			<section className="bg-background py-24 lg:py-32">
				<div className="mx-auto max-w-[88rem] px-5 lg:px-8">
					<div className="max-w-3xl">
						<p className="eyebrow">Monthly or annual</p>
						<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
							Start small. Move up when the work grows.
						</h2>
						<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
							Plus is the best fit for most people. Pro and Max add Live,
							Canvas, Kode and Frontier models for more demanding work.
						</p>
					</div>
					<div className="mt-14">
						<PricingPlanGrid tiers={pricingTiers} location="pricing_page" />
					</div>
				</div>
			</section>

			<ContentSection
				tone="muted"
				eyebrow="How credits work"
				title="Access is included. Metered AI work uses credits."
				description="AI usage credits keep different models and tools on one understandable balance. They do not charge you merely for opening a feature."
			>
				<div className="mt-12 grid gap-5 md:grid-cols-3">
					<article className="rounded-[1.35rem] border border-border bg-card p-7">
						<p className="font-mono text-xs text-brand">01</p>
						<h3 className="font-display mt-8 text-xl">Feature access</h3>
						<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
							Pro and Max include Canvas and Kode access. Opening, editing or
							organising work in those tools does not spend credits.
						</p>
					</article>
					<article className="rounded-[1.35rem] border border-border bg-card p-7">
						<p className="font-mono text-xs text-brand">02</p>
						<h3 className="font-display mt-8 text-xl">AI work</h3>
						<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
							Paid-model requests, web search, K-Image, K-Video, Live, Canvas AI
							actions and Kode AI runs use the shared credit balance.
						</p>
					</article>
					<article className="rounded-[1.35rem] border border-border bg-card p-7">
						<p className="font-mono text-xs text-brand">03</p>
						<h3 className="font-display mt-8 text-xl">Two safeguards</h3>
						<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
							Each plan has request limits and a credit balance. Costlier model
							groups and heavier tools use more credits than Basic requests.
						</p>
					</article>
				</div>
				<div className="mt-5 grid grid-cols-2 overflow-hidden rounded-[1.35rem] border border-border bg-card sm:grid-cols-4">
					{[
						["Basic request", "1 credit"],
						["Pro request", "6 credits"],
						["Frontier request", "25 credits"],
						["Web search", "4 credits"],
						["K-Image", "20 credits"],
						["K-Video", "from 15/second"],
						["Kontinue Live", "2/second"],
						["Kode AI unit (up to 25K tokens)", "25 credits"],
					].map(([label, value]) => (
						<div key={label} className="border-b border-r border-border p-4">
							<p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
								{label}
							</p>
							<p className="mt-1.5 text-sm font-semibold tabular-nums">
								{value}
							</p>
						</div>
					))}
				</div>
				<p className="mt-4 text-xs leading-relaxed text-muted-foreground">
					These are operation rates. The feature-specific request, duration and
					build ceilings in the comparison table still apply.
				</p>
			</ContentSection>

			<section className="bg-background py-24 lg:py-32">
				<div className="mx-auto max-w-[88rem] px-5 lg:px-8">
					<div className="max-w-3xl">
						<p className="eyebrow">Feature comparison</p>
						<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
							Every limit, side by side.
						</h2>
						<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
							Values are shown wherever quantity matters. Use the question marks
							for definitions and details.
						</p>
					</div>
					<div className="mt-14">
						<PricingComparison />
					</div>
					<div className="mt-8 flex flex-wrap gap-5 text-sm">
						<Link
							href="/supported-models"
							className="link-underline font-medium text-brand-strong"
						>
							Review supported models
						</Link>
						<Link
							href="/legal/terms-of-service"
							className="link-underline font-medium text-brand-strong"
						>
							Read the Terms of Service
						</Link>
					</div>
				</div>
			</section>
		</>
	);
}
