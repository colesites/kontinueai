import { Check } from "lucide-react";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import type { BillingPeriod, PricingTier } from "@/data/pricing";
import { appLinks } from "@/data/product";

export function PricingCard({
	tier,
	billingPeriod,
	location = "pricing",
}: {
	tier: PricingTier;
	billingPeriod: BillingPeriod;
	location?: string;
}) {
	const highlighted = tier.highlighted;
	const isFree = tier.id === "free";
	const displayedPrice =
		billingPeriod === "annual" ? tier.annualMonthlyPrice : tier.monthlyPrice;
	const checkoutHref = isFree
		? appLinks.signUp
		: `${appLinks.pricing}?plan=${encodeURIComponent(tier.id)}&period=${billingPeriod}`;

	return (
		<div
			className={`relative flex h-full flex-col rounded-[1.35rem] p-6 ${
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

			<div className="mt-5 flex flex-wrap items-baseline gap-1.5">
				<span className="font-display text-[2.15rem] tracking-tight">
					{displayedPrice}
				</span>
				<span className="text-sm text-muted-foreground">
					{isFree ? "forever" : "/ month"}
				</span>
			</div>
			<p className="mt-1 min-h-5 text-xs text-muted-foreground">
				{isFree
					? "No payment required"
					: billingPeriod === "annual"
						? `Billed ${tier.annualPrice} yearly`
						: "Billed monthly"}
			</p>

			<TrackedLink
				href={checkoutHref}
				target="_blank"
				rel="noopener noreferrer"
				eventName="pricing_cta_clicked"
				eventProperties={{
					plan: tier.id,
					billingPeriod,
					location,
				}}
				variant={highlighted ? "brand" : "outline"}
				className="mt-6 w-full"
			>
				{tier.cta}
			</TrackedLink>

			<p className="mt-7 border-t border-border pt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
				Plan highlights
			</p>
			<ul className="mt-4 space-y-3.5">
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
