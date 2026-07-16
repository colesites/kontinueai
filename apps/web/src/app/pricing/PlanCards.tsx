"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import {
	CheckoutButton,
	SubscriptionDetailsButton,
	usePlans,
} from "@clerk/nextjs/experimental";
import {
	getPlanCardHighlights,
	PLAN_CARD_PRESENTATION,
	PLAN_DEFINITIONS,
	type PlanAudience,
} from "@repo/core/plan-config";
import { PLAN_TIERS, type PlanTier } from "@repo/core/plan-tier";
import { usePlanTier } from "@web/lib/use-plan-tier";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import {
	type BillingPeriod,
	clerkPlanMatchesBillingPrice,
	findClerkPlanForTier,
} from "./clerk-plan-matching";

const AUDIENCES: Array<{ id: PlanAudience; label: string }> = [
	{ id: "personal", label: "Personal" },
	{ id: "professional", label: "Professional" },
];

function ActionButton({
	tier,
	currentTier,
	isSignedIn,
	isLoading,
	clerkPlan,
	billingPeriod,
}: {
	tier: PlanTier;
	currentTier: PlanTier;
	isSignedIn: boolean;
	isLoading: boolean;
	billingPeriod: BillingPeriod;
	clerkPlan?: {
		id: string;
		slug: string;
		name: string;
		fee?: { amount: number } | null;
		annualFee?: { amount: number } | null;
		annualMonthlyFee?: { amount: number } | null;
	};
}) {
	const plan = PLAN_DEFINITIONS[tier];
	const button = (label: string, disabled = false) => (
		<button
			type="button"
			disabled={disabled}
			className={`inline-flex h-11 w-full items-center justify-center rounded-xl border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${
				tier === "plus"
					? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
					: "border-border bg-background/70 text-foreground hover:border-primary/45 hover:bg-primary/8"
			}`}
		>
			{label}
		</button>
	);

	if (!isSignedIn) {
		return (
			<SignInButton mode="modal">
				{button(tier === "free" ? "Start free" : `Get ${plan.name}`)}
			</SignInButton>
		);
	}

	if (tier === "free") {
		if (currentTier === "free") return button("Current plan", true);
		return (
			<SubscriptionDetailsButton>
				{button("Manage subscription")}
			</SubscriptionDetailsButton>
		);
	}

	if (currentTier === tier) {
		return (
			<SubscriptionDetailsButton>
				{button("Manage plan")}
			</SubscriptionDetailsButton>
		);
	}

	if (isLoading) return button("Loading billing…", true);
	if (
		!clerkPlanMatchesBillingPrice(
			clerkPlan,
			billingPeriod,
			plan.priceMonthlyCents,
			plan.priceAnnualCents,
			plan.priceAnnualMonthlyCents,
		)
	) {
		return button("Billing setup required", true);
	}

	return (
		<CheckoutButton
			planId={clerkPlan?.id ?? ""}
			planPeriod={billingPeriod}
			newSubscriptionRedirectUrl="/"
		>
			{button(`Choose ${plan.name}`)}
		</CheckoutButton>
	);
}

export function PlanCards() {
	const { isSignedIn = false } = useUser();
	const currentTier = usePlanTier();
	const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("month");
	const [audience, setAudience] = useState<PlanAudience>("personal");
	const clerkPlans = usePlans({
		for: "user",
		pageSize: 20,
		enabled: true,
	});

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const requestedPeriod = params.get("period");
		if (requestedPeriod === "month" || requestedPeriod === "annual") {
			setBillingPeriod(requestedPeriod);
		}

		const requestedPlan = params.get("plan");
		if (requestedPlan === "pro" || requestedPlan === "max") {
			setAudience("professional");
		}
	}, []);

	const visibleTiers = PLAN_TIERS.filter(
		(tier) => PLAN_CARD_PRESENTATION[tier].audience === audience,
	);
	const isAnnual = billingPeriod === "annual";

	return (
		<div>
			<div className="mb-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
				<fieldset className="inline-flex rounded-full border border-border/70 bg-muted/55 p-1 shadow-sm">
					<legend className="sr-only">Plan type</legend>
					{AUDIENCES.map((option) => {
						const selected = audience === option.id;
						return (
							<button
								key={option.id}
								type="button"
								aria-pressed={selected}
								onClick={() => setAudience(option.id)}
								className={`min-h-11 cursor-pointer rounded-full px-5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
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
					className="hidden h-8 w-px bg-border/70 sm:block"
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
						className={`relative h-11 w-16 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
							isAnnual
								? "border-foreground bg-foreground"
								: "border-border bg-muted"
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
						<span className="text-[10px] font-bold uppercase tracking-wide text-primary">
							Save up to 20%
						</span>
					</div>
				</fieldset>
			</div>
			<section
				aria-live="polite"
				aria-label={`${audience === "personal" ? "Personal" : "Professional"} plans`}
				className={`mx-auto grid items-stretch gap-5 ${
					audience === "personal"
						? "max-w-[68rem] sm:grid-cols-2 lg:grid-cols-3"
						: "max-w-[46rem] sm:grid-cols-2"
				}`}
			>
				{visibleTiers.map((tier) => {
					const plan = PLAN_DEFINITIONS[tier];
					const presentation = PLAN_CARD_PRESENTATION[tier];
					const displayedMonthlyCents =
						billingPeriod === "annual"
							? plan.priceAnnualMonthlyCents
							: plan.priceMonthlyCents;
					const clerkPlan =
						tier === "free"
							? undefined
							: findClerkPlanForTier(clerkPlans.data, tier);
					const billingMismatch =
						tier !== "free" &&
						isSignedIn &&
						!clerkPlans.isLoading &&
						!clerkPlanMatchesBillingPrice(
							clerkPlan,
							billingPeriod,
							plan.priceMonthlyCents,
							plan.priceAnnualCents,
							plan.priceAnnualMonthlyCents,
						);

					return (
						<article
							key={tier}
							className={`relative flex h-full flex-col rounded-[1.35rem] p-6 ${
								presentation.highlighted
									? "border border-primary/45 bg-card ring-1 ring-primary/15 shadow-2xl shadow-primary/10"
									: "border border-border/70 bg-card/75"
							}`}
						>
							{presentation.highlighted ? (
								<div className="mb-4 flex h-6 items-center">
									<span className="rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
										Most popular
									</span>
								</div>
							) : presentation.audience === "personal" ? (
								<div className="mb-4 h-6" aria-hidden="true" />
							) : null}
							<h2 className="text-xl font-semibold tracking-tight">
								{plan.name}
							</h2>
							<p className="mt-2 text-sm font-semibold leading-snug text-foreground">
								{presentation.bestFor}
							</p>
							<p className="mt-1.5 min-h-11 text-sm leading-relaxed text-muted-foreground">
								{presentation.description}
							</p>
							<div className="mt-5 flex flex-wrap items-baseline gap-1.5">
								<span className="text-[2.15rem] font-semibold tracking-tight">
									{displayedMonthlyCents === 0
										? "$0"
										: `$${(displayedMonthlyCents / 100).toFixed(2)}`}
								</span>
								<span className="text-sm text-muted-foreground">
									{tier === "free" ? "forever" : "/ month"}
								</span>
							</div>
							<p className="mt-1 min-h-5 text-xs text-muted-foreground">
								{tier !== "free" && billingPeriod === "annual"
									? `Billed $${(plan.priceAnnualCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} yearly`
									: tier !== "free"
										? "Billed monthly"
										: "No payment required"}
							</p>
							<div className="mt-6">
								<ActionButton
									tier={tier}
									currentTier={currentTier}
									isSignedIn={isSignedIn}
									isLoading={clerkPlans.isLoading}
									clerkPlan={clerkPlan}
									billingPeriod={billingPeriod}
								/>
							</div>
							{billingMismatch ? (
								<p className="mt-2 text-xs leading-relaxed text-destructive">
									This Clerk plan is missing or its {billingPeriod} price does
									not match.
								</p>
							) : null}
							<p className="mt-7 border-t border-border pt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
								Plan highlights
							</p>
							<ul className="mt-4 space-y-3.5">
								{getPlanCardHighlights(tier).map((feature) => (
									<li key={feature} className="flex items-start gap-3 text-sm">
										<Check className="mt-0.5 size-4 shrink-0 text-primary" />
										<span className="text-foreground/80">{feature}</span>
									</li>
								))}
							</ul>
						</article>
					);
				})}
			</section>
			{clerkPlans.isError ? (
				<p className="mt-4 text-sm text-destructive">
					Clerk Billing could not load. Please refresh before choosing a plan.
				</p>
			) : null}
		</div>
	);
}
