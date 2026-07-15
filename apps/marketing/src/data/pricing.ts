import { formatUsd, plans } from "@/data/product";

export type BillingPeriod = "month" | "annual";

export interface PricingTier {
	id: string;
	name: string;
	monthlyPrice: string;
	annualPrice: string;
	annualMonthlyPrice: string;
	tagline: string;
	features: string[];
	highlighted?: boolean;
	cta: string;
}

export const pricingTiers: PricingTier[] = plans.map((plan) => ({
	id: plan.id,
	name: plan.name,
	monthlyPrice: formatUsd(plan.monthlyPriceUsd),
	annualPrice: formatUsd(plan.annualPriceUsd),
	annualMonthlyPrice: formatUsd(plan.annualMonthlyPriceUsd),
	tagline: plan.description,
	features: plan.features,
	highlighted: plan.highlighted,
	cta: plan.cta,
}));
