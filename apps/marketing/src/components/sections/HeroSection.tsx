"use client";

import { Play } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { gsap, useGSAP } from "@/lib/gsap";
import { scrollToTarget } from "@/lib/scroll";
import { APP_URL } from "@/lib/structured-data";
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
				gsap.set(underline, { strokeDasharray: len, strokeDashoffset: len });
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
					{ strokeDashoffset: 0, duration: 0.75, ease: "power2.inOut" },
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
						The multi-model AI workspace
					</p>

					<h1 className="font-display tracking-tightest mt-6 text-[2.75rem] leading-[1.02] sm:text-6xl lg:text-[4.75rem]">
						<span className="block overflow-hidden pb-[0.05em]">
							<span data-h="line" data-anim className="block">
								One <span className="text-brand">workspace</span>
							</span>
						</span>
						<span className="block overflow-hidden pb-[0.28em]">
							<span data-h="line" data-anim className="block">
								for every{" "}
								<span className="relative inline-block whitespace-nowrap">
									AI model
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
						Import your chats, switch between ChatGPT, Claude, Gemini and more
						without losing context, and pay for one plan instead of five.
					</p>

					<div
						data-h="cta"
						data-anim
						className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
					>
						<Button asChild size="lg" className="w-full sm:w-auto">
							<Link
								href={`${APP_URL}/sign-up`}
								target="_blank"
								rel="noopener noreferrer"
							>
								Start free
							</Link>
						</Button>
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="w-full sm:w-auto"
							onClick={() => scrollToTarget("#demo")}
						>
							<Play className="size-4 fill-current" />
							Watch demo
						</Button>
					</div>
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
