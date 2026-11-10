"use client";

import { ArrowUp, Check, Copy, Link2, Share } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { appLinks } from "@/data/product";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

const frame =
	"mt-6 rounded-2xl border border-border bg-card p-4 card-shadow sm:p-5";

function ShareVisual() {
	return (
		<div className={frame}>
			<div className="flex items-center justify-between gap-3">
				<span className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
					<Image
						src="/openai.svg"
						alt=""
						width={18}
						height={18}
						className="size-[18px] shrink-0 object-contain"
					/>
					<span className="truncate">Plan a 5-day Tokyo trip</span>
				</span>
				<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium">
					<Share className="size-3.5" />
					Share
				</span>
			</div>
			<div className="mt-3 flex items-center gap-3 rounded-xl bg-secondary px-3.5 py-2.5">
				<span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
					https://chatgpt.com/share/6f2a91c4
				</span>
				<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
					<Copy className="size-3.5" />
					Copy link
				</span>
			</div>
		</div>
	);
}

function PasteVisual() {
	return (
		<div className={frame}>
			<div className="glow-rail rounded-full">
				<div className="flex h-12 items-center gap-3 rounded-full bg-card pl-5 pr-1.5">
					<Link2 className="size-4 shrink-0 text-brand" />
					<span className="min-w-0 flex-1 truncate font-mono text-xs">
						https://chatgpt.com/share/6f2a91c4
					</span>
					<span className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
						Import
					</span>
				</div>
			</div>
			<p className="mt-4 flex items-center gap-2.5 text-sm font-medium">
				<span className="grid size-5 place-items-center rounded-full bg-brand text-brand-foreground">
					<Check className="size-3" strokeWidth={3} />
				</span>
				24 messages imported, in order
			</p>
		</div>
	);
}

function ContinueVisual() {
	return (
		<div className={`${frame} space-y-3`}>
			<div className="max-w-[85%] rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5 text-sm leading-relaxed">
				Day 3 covers Asakusa and the river walk at dusk.
			</div>
			<div className="flex justify-center">
				<span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-[11px] font-medium text-brand-strong">
					<span className="size-1.5 rounded-full bg-brand" />
					Context kept, now on Claude
				</span>
			</div>
			<div className="flex h-11 items-center gap-2.5 rounded-full border border-border-strong bg-background pl-4 pr-1.5 text-sm">
				<span className="flex-1 truncate">Add a day trip to Hakone</span>
				<span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
					<ArrowUp className="size-4" />
				</span>
			</div>
		</div>
	);
}

const steps = [
	{
		title: "Share the chat",
		description: "On ChatGPT, Claude or Gemini, tap Share and copy the link.",
		Visual: ShareVisual,
	},
	{
		title: "Paste the link",
		description:
			"Kontinue brings the messages over in order, exactly as you left them.",
		Visual: PasteVisual,
	},
	{
		title: "Keep going",
		description:
			"Send your next message on K-AI 1.0 or any model in your plan.",
		Visual: ContinueVisual,
	},
];

export function HowItWorksSection() {
	const root = useRef<HTMLElement>(null);

	useGSAP(
		() => {
			if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

			// The rail fills as you scroll through the steps.
			gsap.fromTo(
				"[data-rail]",
				{ scaleY: 0 },
				{
					scaleY: 1,
					ease: "none",
					scrollTrigger: {
						trigger: "[data-steps]",
						start: "top 62%",
						end: "bottom 62%",
						scrub: 0.4,
					},
				},
			);

			// Each step lights up and settles in as the rail reaches it.
			for (const step of gsap.utils.toArray<HTMLElement>("[data-step]")) {
				gsap.set(step, { opacity: 0.35, y: 18 });
				ScrollTrigger.create({
					trigger: step,
					start: "top 62%",
					onEnter: () => {
						step.dataset.active = "true";
						gsap.to(step, {
							opacity: 1,
							y: 0,
							duration: 0.6,
							ease: "power3.out",
						});
					},
					onLeaveBack: () => {
						step.dataset.active = "false";
						gsap.to(step, { opacity: 0.35, y: 18, duration: 0.4 });
					},
				});
			}
		},
		{ scope: root },
	);

	return (
		<section
			ref={root}
			id="how-it-works"
			className="border-t border-border bg-secondary/40 py-20 lg:py-28"
		>
			<div className="mx-auto grid max-w-6xl gap-14 px-5 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 lg:px-8">
				<div className="min-w-0 lg:sticky lg:top-32 lg:self-start">
					<p className="eyebrow">How it works</p>
					<h2 className="font-display tracking-tightest mt-4 text-4xl leading-[1.06] sm:text-5xl">
						Three steps. Same chat. No restart.
					</h2>
					<p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
						From limit reached to back at work, without explaining it all again.
					</p>
					<TrackedLink
						href={appLinks.import}
						target="_blank"
						rel="noopener noreferrer"
						eventName="import_page_cta_clicked"
						eventProperties={{ location: "homepage_how_it_works" }}
						className="mt-8"
					>
						Continue a chat
					</TrackedLink>
				</div>

				<ol data-steps className="relative min-w-0 space-y-14 pl-14 sm:pl-16">
					{/* Rail: muted track with a brand fill driven by scroll. */}
					<span
						aria-hidden
						className="absolute bottom-2 left-[1.05rem] top-2 w-px bg-border-strong"
					/>
					<span
						aria-hidden
						data-rail
						className="absolute bottom-2 left-[1.05rem] top-2 w-px origin-top bg-brand shadow-[0_0_12px_var(--brand)]"
					/>

					{steps.map(({ title, description, Visual }, index) => (
						<li key={title} data-step className="group relative">
							<span className="absolute -left-14 top-0 grid size-9 place-items-center rounded-full border border-border-strong bg-card font-mono text-xs text-muted-foreground transition-colors duration-300 group-data-[active=true]:border-brand group-data-[active=true]:bg-brand group-data-[active=true]:text-brand-foreground group-data-[active=true]:shadow-[0_0_0_6px_var(--brand-tint)] sm:-left-16">
								{index + 1}
							</span>
							<h3 className="font-display pt-0.5 text-2xl tracking-tight">
								{title}
							</h3>
							<p className="mt-2 max-w-md leading-relaxed text-muted-foreground">
								{description}
							</p>
							<Visual />
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
