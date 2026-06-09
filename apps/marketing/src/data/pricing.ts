import type { PricingTier } from "@/components/sections/PricingSection";

export const pricingTiers: PricingTier[] = [
	{
		id: "free",
		name: "Free",
		price: "$0",
		period: "month",
		features: [
			"Try Kontinue AI",
			"Limited chats/messages",
			"Fewer Imports",
			"Basic model access",
		],
	},
	{
		id: "starter",
		name: "Starter",
		price: "$8.99",
		period: "month",
		highlighted: true,
		features: [
			"Higher monthly limits",
			"Higher imports",
			"Access to more models",
			"Image generation",
		],
	},
	{
		id: "pro",
		name: "Pro",
		price: "$50",
		period: "month",
		features: [
			"Unlimited power",
			"All models included",
			"Image generation",
			"Video generation",
		],
	},
];
