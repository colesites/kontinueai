import { Reveal } from "@/components/anim/Reveal";
import { AppWaitlistInline } from "@/components/marketing/AppWaitlistInline";
import { PlatformGrid } from "@/components/marketing/PlatformGrid";
import { AppDevices } from "./AppDevices";

export function AppsSection() {
	return (
		<section
			id="apps"
			className="surface-dark relative overflow-hidden py-20 lg:py-28"
		>
			<div
				aria-hidden
				className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-60"
			/>
			<div className="relative mx-auto max-w-6xl px-5 lg:px-8">
				<Reveal className="mx-auto flex max-w-2xl flex-col items-center text-center">
					<p className="eyebrow inline-flex items-center gap-2">
						<span className="size-1.5 rounded-full bg-brand" />
						Coming soon
					</p>
					<h2 className="font-display tracking-tightest mt-4 text-4xl leading-[1.06] sm:text-5xl">
						On the web today. Desktop and mobile next.
					</h2>
					<p className="mt-5 text-lg leading-relaxed text-muted-foreground">
						Desktop picks up your Claude Code and Codex projects when you hit a
						rate limit. Mobile keeps every chat in your pocket.
					</p>
					<p className="mb-3 mt-8 text-sm font-medium">
						Get one email when they launch
					</p>
					<AppWaitlistInline location="homepage_apps" />
				</Reveal>

				<Reveal y={40} className="mt-14 lg:mt-16">
					<AppDevices />
				</Reveal>

				<Reveal y={24} className="mt-14 lg:mt-16">
					<PlatformGrid />
				</Reveal>
			</div>
		</section>
	);
}
