import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/anim/Reveal";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import type { PricingTier } from "@/data/pricing";
import { appLinks } from "@/data/product";

interface PricingSectionProps {
	tiers: PricingTier[];
}

/**
 * Homepage pricing summary: one scannable row per plan. The full plan cards,
 * billing toggle and feature comparison live on /pricing.
 */
export function PricingSection({ tiers }: PricingSectionProps) {
	return (
		<section id="pricing" className="bg-background py-20 lg:py-28">
			<div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-8">
				<Reveal className="max-w-md">
					<p className="eyebrow">Pricing</p>
					<h2 className="font-display tracking-tightest mt-4 text-4xl leading-[1.06] sm:text-5xl">
						Start free. Upgrade when you need more.
					</h2>
					<p className="mt-5 text-lg leading-relaxed text-muted-foreground">
						Free includes K-AI 1.0 and 10 chat imports. Paid plans add higher
						limits, premium models, voice and advanced tools.
					</p>
					<Link
						href="/pricing"
						className="group mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong"
					>
						Compare every plan and limit
						<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
					</Link>
				</Reveal>

				<Reveal y={24}>
					<ul className="overflow-hidden rounded-2xl border border-border bg-card">
						{tiers.map((tier) => {
							const isFree = tier.id === "free";
							const href = isFree
								? appLinks.signUp
								: `${appLinks.pricing}?plan=${encodeURIComponent(tier.id)}&period=month`;
							return (
								<li
									key={tier.id}
									className="border-b border-border last:border-b-0"
								>
									<TrackedLink
										href={href}
										target="_blank"
										rel="noopener noreferrer"
										eventName="pricing_cta_clicked"
										eventProperties={{
											plan: tier.id,
											billingPeriod: "month",
											location: "homepage_pricing",
										}}
										variant="link"
										className="group flex h-auto w-full items-center justify-between gap-4 whitespace-normal rounded-none px-5 py-4 text-left no-underline transition-colors hover:bg-secondary/60 hover:no-underline sm:px-6"
									>
										<span className="min-w-0">
											<span className="flex items-center gap-2.5">
												<span className="font-display text-lg tracking-tight">
													{tier.name}
												</span>
												{tier.highlighted ? (
													<span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-foreground">
														Popular
													</span>
												) : null}
											</span>
											<span className="mt-0.5 block text-sm font-normal text-muted-foreground">
												{tier.bestFor}
											</span>
										</span>
										<span className="flex shrink-0 items-center gap-4">
											<span className="text-right">
												<span className="font-display text-lg tracking-tight tabular-nums">
													{tier.monthlyPrice}
												</span>
												<span className="text-sm font-normal text-muted-foreground">
													{isFree ? " forever" : " / mo"}
												</span>
											</span>
											<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
										</span>
									</TrackedLink>
								</li>
							);
						})}
					</ul>
					<p className="mt-4 text-sm text-muted-foreground">
						Prices in USD. Save with annual billing.
					</p>
				</Reveal>
			</div>
		</section>
	);
}
