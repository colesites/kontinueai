import { DemoVideo } from "@/components/sections/DemoVideo";
import { FAQSection } from "@/components/sections/FAQSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { HeroSection } from "@/components/sections/HeroSection";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { ImportSection } from "@/components/sections/ImportSection";
import { KontinueModelSection } from "@/components/sections/KontinueModelSection";
import { ModelStrip } from "@/components/sections/ModelStrip";
import { PricingSection } from "@/components/sections/PricingSection";
import { ProblemSection } from "@/components/sections/ProblemSection";
import { ProductDefinitionSection } from "@/components/sections/ProductDefinitionSection";
import { UseCasesSection } from "@/components/sections/UseCasesSection";
import { pricingTiers } from "@/data/pricing";
import { marketingScenarios } from "@/data/useCases";
import { pageMetadata } from "@/lib/metadata";
import { softwareSchema } from "@/lib/structured-data";

export const metadata: Metadata = pageMetadata({
	title: "Kontinue AI | African-Built Multi-Model AI Platform",
	description:
		"Use K-AI 1.0, access leading AI models and import supported conversations with their context. Built in Africa for the world.",
	path: "/",
});

export default function Home() {
	return (
		<>
			<JsonLd data={softwareSchema} />
			<HeroSection />
			<ProductDefinitionSection />
			<KontinueModelSection />
			<ImportSection />
			<DemoVideo />
			<ModelStrip />
			<ProblemSection />
			<HowItWorks />
			<FeaturesSection />
			<UseCasesSection items={marketingScenarios} />
			<PricingSection tiers={pricingTiers} />
			<FAQSection />
			<FinalCTA />
		</>
	);
}

import type { Metadata } from "next";
import { JsonLd } from "@/components/marketing/JsonLd";
