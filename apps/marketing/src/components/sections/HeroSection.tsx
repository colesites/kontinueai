"use client";

import { track } from "@vercel/analytics";
import { ArrowDown, Check } from "lucide-react";
import { useRef } from "react";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { Button } from "@/components/ui/button";
import { appLinks } from "@/data/product";
import { gsap, useGSAP } from "@/lib/gsap";
import { scrollToTarget } from "@/lib/scroll";
import { HeroWorkspace } from "./HeroWorkspace";

export function HeroSection() {
	const root = useRef<HTMLElement>(null);
	const card = useRef<HTMLDivElement>(null);

	useGSAP(
		() => {
			const reduced = window.matchMedia(
				"(prefers-reduced-motion: reduce)",
			).matches;
			const underline = root.current?.querySelector<SVGPathElement>(
				"[data-h='underline']",
			);
			if (underline && !reduced) {
				const len = underline.getTotalLength();
				gsap.set(underline, {
					strokeDasharray: `${len} ${len}`,
					strokeDashoffset: len,
				});
			}

			const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
			tl.fromTo(
				"[data-h='eyebrow']",
				{ autoAlpha: 0, y: 14 },
				{ autoAlpha: 1, y: 0, duration: 0.7 },
			)
				.fromTo(
					"[data-h='line']",
					{ autoAlpha: 0, yPercent: 118 },
					{ autoAlpha: 1, yPercent: 0, duration: 1, stagger: 0.12 },
					"-=0.3",
				)
				.fromTo(
					"[data-h='sub']",
					{ autoAlpha: 0, y: 18 },
					{ autoAlpha: 1, y: 0, duration: 0.8 },
					"-=0.55",
				)
				.fromTo(
					"[data-h='cta']",
					{ autoAlpha: 0, y: 18 },
					{ autoAlpha: 1, y: 0, duration: 0.7 },
					"-=0.6",
				)
				.fromTo(
					"[data-h='card']",
					{ autoAlpha: 0, y: 44, scale: 0.97 },
					{ autoAlpha: 1, y: 0, scale: 1, duration: 1.1 },
					"-=0.65",
				);

			if (underline && !reduced) {
				tl.to(
					underline,
					{
						strokeDashoffset: 0,
						duration: 0.75,
						ease: "power2.inOut",
						onComplete: () => {
							gsap.set(underline, {
								strokeDasharray: "none",
								strokeDashoffset: 0,
							});
						},
					},
					"-=0.8",
				);
			}

			gsap.to(card.current, {
				yPercent: -6,
				ease: "none",
				scrollTrigger: {
					trigger: root.current,
					start: "top top",
					end: "bottom top",
					scrub: true,
				},
			});
		},
		{ scope: root },
	);

	return (
		<section
			ref={root}
			className="bg-noise relative overflow-hidden pt-28 pb-16 sm:pt-36 lg:pt-44 lg:pb-24"
		>
			<div
				aria-hidden
				className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-70"
			/>

			<div className="relative mx-auto max-w-6xl px-5 lg:px-8">
				<div className="mx-auto max-w-3xl text-center">
					<p
						data-h="eyebrow"
						data-anim
						className="eyebrow inline-flex items-center gap-2"
					>
						<span className="size-1.5 rounded-full bg-brand" />
						Built in Africa for the world
					</p>

					<h1 className="font-display tracking-tightest mt-6 text-[2.75rem] leading-[1.02] sm:text-6xl lg:text-[4.75rem]">
						<span className="block overflow-hidden pb-[0.05em]">
							<span data-h="line" data-anim className="block">
								One <span className="text-brand">AI platform</span>
							</span>
						</span>
						<span className="block overflow-hidden pb-[0.28em]">
							<span data-h="line" data-anim className="block">
								for every model—and every{" "}
								<span className="relative inline-block whitespace-nowrap">
									conversation.
									<svg
										aria-hidden="true"
										viewBox="0 0 200 12"
										preserveAspectRatio="none"
										className="pointer-events-none absolute left-0 top-full -mt-[0.08em] h-[0.3em] w-full overflow-visible text-brand"
									>
										<path
											data-h="underline"
											d="M2 6 C 35 11, 62 1, 99 6 S 166 11, 198 4"
											fill="none"
											stroke="currentColor"
											strokeWidth={3}
											strokeLinecap="round"
											vectorEffect="non-scaling-stroke"
										/>
									</svg>
								</span>
							</span>
						</span>
					</h1>

					<p
						data-h="sub"
						data-anim
						className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
					>
						Use K-AI 1.0 or switch between leading AI models from OpenAI,
						Anthropic, Google, xAI, and more. Import supported conversations and
						continue from the context already there.
					</p>

					<div
						data-h="cta"
						data-anim
						className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
					>
						<TrackedLink
							href={appLinks.signUp}
							target="_blank"
							rel="noopener noreferrer"
							eventName="hero_start_free_clicked"
							eventProperties={{ location: "homepage_hero" }}
							size="lg"
							className="w-full sm:w-auto"
						>
							Start free
						</TrackedLink>
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="w-full sm:w-auto"
							onClick={() => {
								track("hero_import_demo_clicked", {
									location: "homepage_hero",
								});
								scrollToTarget("#import-conversations");
							}}
						>
							<ArrowDown className="size-4" />
							See how importing works
						</Button>
					</div>

					<ul className="mx-auto mt-9 grid max-w-2xl justify-items-center gap-3 text-center text-sm text-muted-foreground sm:grid-cols-2">
						{[
							"K-AI 1.0, Kontinue AI’s native option",
							"Import from supported AI platforms",
							"Switch models inside one conversation",
							"Selected models from leading providers",
						].map((point) => (
							<li
								key={point}
								className="flex items-center justify-center gap-2"
							>
								<Check className="size-4 shrink-0 text-brand" />
								{point}
							</li>
						))}
					</ul>
				</div>

				<div
					ref={card}
					data-h="card"
					data-anim
					className="mx-auto mt-16 max-w-xl sm:mt-20"
				>
					<HeroWorkspace />
				</div>
			</div>
		</section>
	);
}
