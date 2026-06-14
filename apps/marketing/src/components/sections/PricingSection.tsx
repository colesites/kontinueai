import { Reveal } from "@/components/anim/Reveal";
import type { PricingTier } from "@/data/pricing";
import { PricingCard } from "./PricingCard";

interface PricingSectionProps {
	tiers: PricingTier[];
}

export function PricingSection({ tiers }: PricingSectionProps) {
	return (
		<section
			id="pricing"
			className="border-y border-border bg-secondary/40 py-24 lg:py-32"
		>
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<Reveal className="mx-auto max-w-2xl text-center">
					<p className="eyebrow">Pricing</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						One plan instead of five
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
						Start free. Upgrade when you want higher limits, more models, and
						image or video generation.
					</p>
				</Reveal>

				<Reveal
					stagger={0.12}
					className="mx-auto mt-14 grid max-w-5xl items-stretch gap-6 lg:mt-20 lg:grid-cols-3"
				>
					{tiers.map((tier) => (
						<div key={tier.id} data-anim className="h-full">
							<PricingCard tier={tier} />
						</div>
					))}
				</Reveal>

				<p className="mt-10 text-center text-sm text-muted-foreground">
					Prices in USD. Cancel anytime.
				</p>
			</div>
		</section>
	);
}
