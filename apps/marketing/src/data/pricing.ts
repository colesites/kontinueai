export interface PricingTier {
	id: string;
	name: string;
	price: string;
	period: string;
	tagline: string;
	features: string[];
	highlighted?: boolean;
	cta: string;
}

export const pricingTiers: PricingTier[] = [
	{
		id: "free",
		name: "Free",
		price: "$0",
		period: "forever",
		tagline: "Try the workspace and a few imports.",
		features: [
			"Try Kontinue AI",
			"Limited chats and messages",
			"A handful of imports each month",
			"Basic model access",
		],
		cta: "Start free",
	},
	{
		id: "starter",
		name: "Starter",
		price: "$8.99",
		period: "per month",
		highlighted: true,
		tagline: "For daily users who switch models often.",
		features: [
			"Higher monthly limits",
			"More imports every month",
			"Access to more models",
			"Image generation",
		],
		cta: "Get Starter",
	},
	{
		id: "pro",
		name: "Pro",
		price: "$50",
		period: "per month",
		tagline: "Top tier of every model in one bill.",
		features: [
			"The highest limits we offer",
			"Every model included",
			"Image generation",
			"Video generation",
		],
		cta: "Get Pro",
	},
];
