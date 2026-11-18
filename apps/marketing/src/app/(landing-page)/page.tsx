import type { Metadata } from "next";
import { JsonLd } from "@/components/marketing/JsonLd";
import { FAQSection } from "@/components/sections/FAQSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { HeroSection } from "@/components/sections/HeroSection";
import { HowItWorksSection } from "@/components/sections/HowItWorksSection";
import { PricingSection } from "@/components/sections/PricingSection";
import { pricingTiers } from "@/data/pricing";
import {
	formatDownloads,
	getDesktopRelease,
	SHOW_DOWNLOADS_FROM,
} from "@/lib/desktop-release";
import { pageMetadata } from "@/lib/metadata";
import { softwareSchema } from "@/lib/structured-data";

export const metadata: Metadata = pageMetadata({
	title: "Continue ChatGPT, Claude and Claude Code After a Limit | Kontinue AI",
	description:
		"Out of messages in ChatGPT, Claude or Gemini, or rate-limited in Claude Code or Codex? Paste the share link and keep going with the full context.",
	path: "/",
});

export default async function Home() {
	const release = await getDesktopRelease();
	const desktop = {
		version: release?.version ?? null,
		downloads:
			release && release.totalDownloads >= SHOW_DOWNLOADS_FROM
				? formatDownloads(release.totalDownloads)
				: null,
	};
	return (
		<>
			<JsonLd data={softwareSchema} />
			<HeroSection desktop={desktop} />
			<HowItWorksSection />
			<FeaturesSection />
			<PricingSection tiers={pricingTiers} />
			<FAQSection />
			<FinalCTA />
		</>
	);
}
