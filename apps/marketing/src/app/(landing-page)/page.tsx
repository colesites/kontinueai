import { DemoVideo } from "@/components/sections/DemoVideo";
import { FAQSection } from "@/components/sections/FAQSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { HeroSection } from "@/components/sections/HeroSection";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { ModelStrip } from "@/components/sections/ModelStrip";
import { PricingSection } from "@/components/sections/PricingSection";
import { ProblemSection } from "@/components/sections/ProblemSection";
import { UseCasesSection } from "@/components/sections/UseCasesSection";
import { pricingTiers } from "@/data/pricing";
import { useCases } from "@/data/useCases";

export default function Home() {
	return (
		<>
			<HeroSection />
			<ModelStrip />
			<DemoVideo />
			<ProblemSection />
			<HowItWorks />
			<FeaturesSection />
			<UseCasesSection useCases={useCases} />
			<PricingSection tiers={pricingTiers} />
			<FAQSection />
			<FinalCTA />
		</>
	);
}
