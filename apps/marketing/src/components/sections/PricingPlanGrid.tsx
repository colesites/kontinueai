"use client";

import { useState } from "react";
import type { BillingPeriod, PricingTier } from "@/data/pricing";
import { PricingCard } from "./PricingCard";

export function PricingPlanGrid({
	tiers,
	location,
}: {
	tiers: PricingTier[];
	location: string;
}) {
	const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("month");

	return (
		<div>
			<div className="flex justify-center">
				<fieldset className="inline-flex rounded-full border border-border bg-secondary/70 p-1 shadow-sm">
					<legend className="sr-only">Billing period</legend>
					{(["month", "annual"] as const).map((period) => {
						const selected = billingPeriod === period;
						return (
							<button
								key={period}
								type="button"
								aria-pressed={selected}
								onClick={() => setBillingPeriod(period)}
								className={`min-h-10 rounded-full px-5 text-sm font-semibold transition ${
									selected
										? "bg-foreground text-background shadow-sm"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{period === "month" ? "Monthly" : "Annual"}
								{period === "annual" ? (
									<span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-brand">
										Save up to 20%
									</span>
								) : null}
							</button>
						);
					})}
				</fieldset>
			</div>

			<div className="mt-10 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
				{tiers.map((tier) => (
					<PricingCard
						key={tier.id}
						tier={tier}
						billingPeriod={billingPeriod}
						location={location}
					/>
				))}
			</div>
		</div>
	);
}
