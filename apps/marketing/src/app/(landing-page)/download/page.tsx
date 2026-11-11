import type { Metadata } from "next";
import { Reveal } from "@/components/anim/Reveal";
import { AppWaitlistInline } from "@/components/marketing/AppWaitlistInline";
import { PlatformGrid } from "@/components/marketing/PlatformGrid";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
	title: "Download Kontinue AI | Desktop and Mobile Apps Coming Soon",
	description:
		"Kontinue AI runs on the web today. Apps for desktop, iPhone, iPad and Android are coming soon. Get an email at launch.",
	path: "/download",
});

export default function DownloadPage() {
	return (
		<section className="relative overflow-hidden px-5 pt-32 pb-24 lg:px-8 lg:pt-40 lg:pb-32">
			<div
				aria-hidden
				className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-60"
			/>

			<div className="relative mx-auto max-w-6xl">
				<Reveal className="text-center">
					<p className="eyebrow">Get the app</p>
					<h1 className="font-display tracking-tightest mx-auto mt-5 max-w-2xl text-[2.5rem] leading-[1.04] sm:text-6xl">
						Take Kontinue AI anywhere
					</h1>
					<p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
						Kontinue runs in your browser today. Desktop, iPhone, iPad and
						Android apps are on the way.
					</p>
				</Reveal>

				<Reveal y={24} className="mt-14">
					<PlatformGrid />
				</Reveal>

				<Reveal className="mt-12 flex flex-col items-center gap-4 text-center">
					<div>
						<h2 className="font-display text-xl tracking-tight">
							Get an email when the apps launch
						</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							One message per launch. Nothing else.
						</p>
					</div>
					<AppWaitlistInline location="download_page" />
				</Reveal>
			</div>
		</section>
	);
}
