import type { Metadata } from "next";
import { JsonLd } from "@/components/marketing/JsonLd";
import { AppsSection } from "@/components/sections/AppsSection";
import { FAQSection } from "@/components/sections/FAQSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { HeroSection } from "@/components/sections/HeroSection";
import { HowItWorksSection } from "@/components/sections/HowItWorksSection";
import { PricingSection } from "@/components/sections/PricingSection";
import { pricingTiers } from "@/data/pricing";
import { pageMetadata } from "@/lib/metadata";
import { softwareSchema } from "@/lib/structured-data";

export const metadata: Metadata = pageMetadata({
	title: "Kontinue AI | Hit your AI limit? Keep going.",
	description:
		"Out of messages on Claude or ChatGPT? Bring the conversation to Kontinue AI and continue with the full context on K-AI 1.0 or any leading model.",
	path: "/",
});

export default function Home() {
	return (
		<>
			<JsonLd data={softwareSchema} />
			<HeroSection />
			<HowItWorksSection />
			<FeaturesSection />
			<AppsSection />
			<PricingSection tiers={pricingTiers} />
			<FAQSection />
			<FinalCTA />
		</>
	);
}
