import { formatUsd, type ProductPlan, plans } from "@/data/product";

export type BillingPeriod = "month" | "annual";

export interface PricingTier {
	id: ProductPlan["id"];
	name: string;
	monthlyPrice: string;
	annualPrice: string;
	annualMonthlyPrice: string;
	audience: ProductPlan["audience"];
	bestFor: string;
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
	audience: plan.audience,
	bestFor: plan.bestFor,
	tagline: plan.description,
	features: plan.features,
	highlighted: plan.highlighted,
	cta: plan.cta,
}));
