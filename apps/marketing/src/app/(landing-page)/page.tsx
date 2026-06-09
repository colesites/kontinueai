import { FAQSection } from "@/components/sections/FAQSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { HeroSection } from "@/components/sections/HeroSection";
import { PricingSection } from "@/components/sections/PricingSection";
import { ProblemSection } from "@/components/sections/ProblemSection";
import { UseCasesSection } from "@/components/sections/UseCasesSection";
import { VideoSection } from "@/components/sections/VideoSection";
import { pricingTiers } from "@/data/pricing";
import { useCases } from "@/data/useCases";

export default function Home() {
	return (
		<>
			<HeroSection />
			<VideoSection />
			<ProblemSection />
			<FeaturesSection />
			<UseCasesSection useCases={useCases} />
			<PricingSection tiers={pricingTiers} />
			<FAQSection />
			<FinalCTA />
		</>
	);
}
