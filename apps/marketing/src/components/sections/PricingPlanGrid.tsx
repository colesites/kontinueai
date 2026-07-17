"use client";

import { useState } from "react";
import type { BillingPeriod, PricingTier } from "@/data/pricing";
import { PricingCard } from "./PricingCard";

type PlanAudience = PricingTier["audience"];

const AUDIENCES: Array<{ id: PlanAudience; label: string }> = [
	{ id: "personal", label: "Personal" },
	{ id: "professional", label: "Professional" },
];

export function PricingPlanGrid({
	tiers,
	location,
}: {
	tiers: PricingTier[];
	location: string;
}) {
	const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("month");
	const [audience, setAudience] = useState<PlanAudience>("personal");
	const visibleTiers = tiers.filter((tier) => tier.audience === audience);
	const isAnnual = billingPeriod === "annual";

	return (
		<div>
			<div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
				<fieldset className="inline-flex rounded-full border border-border bg-secondary/70 p-1 shadow-sm">
					<legend className="sr-only">Plan type</legend>
					{AUDIENCES.map((option) => {
						const selected = audience === option.id;
						return (
							<button
								key={option.id}
								type="button"
								aria-pressed={selected}
								onClick={() => setAudience(option.id)}
								className={`min-h-11 cursor-pointer rounded-full px-5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
									selected
										? "bg-foreground text-background shadow-sm"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{option.label}
							</button>
						);
					})}
				</fieldset>

				<div
					className="hidden h-8 w-px bg-border sm:block"
					aria-hidden="true"
				/>

				<fieldset className="flex items-center gap-3">
					<legend className="sr-only">Billing period</legend>
					<span
						className={`text-sm font-semibold ${isAnnual ? "text-muted-foreground" : "text-foreground"}`}
					>
						Monthly
					</span>
					<button
						type="button"
						role="switch"
						aria-checked={isAnnual}
						aria-label="Annual billing"
						onClick={() => setBillingPeriod(isAnnual ? "month" : "annual")}
						className={`relative h-11 w-16 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
							isAnnual
								? "border-foreground bg-foreground"
								: "border-border bg-secondary"
						}`}
					>
						<span
							aria-hidden="true"
							className={`absolute left-2 top-1/2 size-7 -translate-y-1/2 rounded-full bg-background shadow-sm transition-transform duration-200 ${
								isAnnual ? "translate-x-5" : "translate-x-0"
							}`}
						/>
					</button>
					<div className="flex items-center gap-2">
						<span
							className={`text-sm font-semibold ${isAnnual ? "text-foreground" : "text-muted-foreground"}`}
						>
							Annual
						</span>
						<span className="text-[10px] font-bold uppercase tracking-wide text-brand">
							Save with annual
						</span>
					</div>
				</fieldset>
			</div>

			<section
				aria-live="polite"
				aria-label={`${audience === "personal" ? "Personal" : "Professional"} plans`}
				className={`mx-auto mt-10 grid items-stretch gap-5 ${
					audience === "personal"
						? "max-w-[68rem] sm:grid-cols-2 lg:grid-cols-3"
						: "max-w-[46rem] sm:grid-cols-2"
				}`}
			>
				{visibleTiers.map((tier) => (
					<PricingCard
						key={tier.id}
						tier={tier}
						billingPeriod={billingPeriod}
						location={location}
					/>
				))}
			</section>
		</div>
	);
}
