import Link from "next/link";
import { Reveal } from "@/components/anim/Reveal";
import type { PricingTier } from "@/data/pricing";
import { PricingPlanGrid } from "./PricingPlanGrid";

interface PricingSectionProps {
	tiers: PricingTier[];
}

export function PricingSection({ tiers }: PricingSectionProps) {
	return (
		<section
			id="pricing"
			className="border-y border-border bg-secondary/40 py-24 lg:py-32"
		>
			<div className="mx-auto max-w-[88rem] px-5 lg:px-8">
				<Reveal className="mx-auto max-w-2xl text-center">
					<p className="eyebrow">Pricing</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						Choose the plan that fits your work
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
						Start with K-AI 1.0 and core features. Upgrade for higher usage
						limits, premium models, imports, voice, and advanced tools.
					</p>
				</Reveal>

				<Reveal y={32} className="mx-auto mt-14 lg:mt-20">
					<PricingPlanGrid tiers={tiers} location="homepage_pricing" />
				</Reveal>

				<p className="mt-10 text-center text-sm text-muted-foreground">
					Prices in USD, billed monthly or annually. Request limits and AI usage
					credits reset every month.
				</p>
				<div className="mt-5 text-center">
					<Link
						href="/pricing"
						className="link-underline text-sm font-medium text-brand-strong"
					>
						Compare every feature and limit
					</Link>
				</div>
			</div>
		</section>
	);
}
