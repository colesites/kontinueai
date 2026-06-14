import { Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PricingTier } from "@/data/pricing";
import { APP_URL } from "@/lib/structured-data";

export function PricingCard({ tier }: { tier: PricingTier }) {
	const highlighted = tier.highlighted;

	return (
		<div
			className={`relative flex h-full flex-col rounded-[1.4rem] p-7 sm:p-8 ${
				highlighted
					? "border border-brand/40 bg-card ring-1 ring-brand/15 card-shadow"
					: "border border-border bg-card"
			}`}
		>
			<div className="mb-4 flex h-6 items-center">
				{highlighted && (
					<span className="rounded-full bg-brand px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-foreground">
						Most popular
					</span>
				)}
			</div>

			<h3 className="font-display text-xl tracking-tight">{tier.name}</h3>
			<p className="mt-2 min-h-[2.75rem] text-sm leading-relaxed text-muted-foreground">
				{tier.tagline}
			</p>

			<div className="mt-5 flex items-baseline gap-1.5">
				<span className="font-display text-4xl tracking-tight">
					{tier.price}
				</span>
				<span className="text-sm text-muted-foreground">{tier.period}</span>
			</div>

			<Button
				asChild
				variant={highlighted ? "brand" : "outline"}
				className="mt-6 w-full"
			>
				<Link
					href={`${APP_URL}/sign-up`}
					target="_blank"
					rel="noopener noreferrer"
				>
					{tier.cta}
				</Link>
			</Button>

			<ul className="mt-7 space-y-3.5 border-t border-border pt-7">
				{tier.features.map((feature) => (
					<li key={feature} className="flex items-start gap-3 text-sm">
						<Check className="mt-0.5 size-4 shrink-0 text-brand" />
						<span className="text-foreground/80">{feature}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
