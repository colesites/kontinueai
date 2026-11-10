"use client";

import { track } from "@vercel/analytics";
import { ArrowDown } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { Button } from "@/components/ui/button";
import { modelLogos } from "@/data/models";
import { appLinks } from "@/data/product";
import { gsap, useGSAP } from "@/lib/gsap";
import { scrollToTarget } from "@/lib/scroll";

const DEMO_SRC =
	"https://res.cloudinary.com/djsskkp4r/video/upload/q_auto/f_auto/v1784125732/Kontinue_AI_Demo_lqp7s6.mp4";
const DEMO_POSTER =
	"https://res.cloudinary.com/djsskkp4r/video/upload/so_2,q_auto/v1784125732/Kontinue_AI_Demo_lqp7s6.jpg";

export function HeroSection() {
	const root = useRef<HTMLElement>(null);
	const stage = useRef<HTMLDivElement>(null);

	useGSAP(
		() => {
			const reduced = window.matchMedia(
				"(prefers-reduced-motion: reduce)",
			).matches;

			const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
			tl.fromTo(
				"[data-h='line']",
				{ autoAlpha: 0, yPercent: 110 },
				{ autoAlpha: 1, yPercent: 0, duration: 0.9, stagger: 0.1 },
			)
				.fromTo(
					"[data-h='fade']",
					{ autoAlpha: 0, y: 14 },
					{ autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08 },
					"-=0.5",
				)
				.fromTo(
					"[data-h='card']",
					{ autoAlpha: 0, y: 48 },
					{ autoAlpha: 1, y: 0, duration: 1.1 },
					"-=0.6",
				);

			// The window starts leaning back and settles flat as you scroll in.
			if (!reduced && stage.current) {
				gsap.fromTo(
					stage.current,
					{ rotateX: 16, scale: 0.94 },
					{
						rotateX: 0,
						scale: 1,
						ease: "none",
						scrollTrigger: {
							trigger: stage.current,
							start: "top 92%",
							end: "top 22%",
							scrub: 0.6,
						},
					},
				);
			}
		},
		{ scope: root },
	);

	return (
		<section
			ref={root}
			className="relative overflow-hidden pt-28 sm:pt-36 lg:pt-36"
		>
			<div
				aria-hidden
				className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-70"
			/>

			<div className="relative mx-auto max-w-6xl px-5 lg:px-8">
				<div className="mx-auto max-w-4xl text-center">
					<h1 className="font-display tracking-tightest text-[2.9rem] leading-[1] sm:text-7xl lg:text-[5.5rem]">
						<span className="block overflow-hidden pb-[0.06em]">
							<span data-h="line" data-anim className="block">
								Hit your AI limit?
							</span>
						</span>
						<span className="block overflow-hidden pb-[0.14em]">
							<span data-h="line" data-anim className="block text-brand">
								Keep going.
							</span>
						</span>
					</h1>

					<p
						data-h="fade"
						data-anim
						className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
					>
						Bring any chat from ChatGPT, Claude or Gemini into Kontinue and pick
						up where you left off, on the model you choose.
					</p>

					<div
						data-h="fade"
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
							Continue a chat
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
								scrollToTarget("#how-it-works");
							}}
						>
							<ArrowDown className="size-4" />
							See how it works
						</Button>
					</div>

					<p
						data-h="fade"
						data-anim
						className="mt-6 text-sm text-muted-foreground"
					>
						Free to start. On the web today,{" "}
						<a
							href="#apps"
							className="font-medium text-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-foreground"
						>
							desktop and mobile coming soon
						</a>
						.
					</p>
				</div>

				{/* Product stage */}
				<div
					data-h="card"
					data-anim
					className="relative mx-auto mt-14 max-w-5xl sm:mt-16"
					style={{ perspective: "2200px" }}
				>
					<div
						aria-hidden
						className="bloom pointer-events-none absolute inset-x-[8%] top-[18%] bottom-[-6%] opacity-60"
					/>
					<div
						ref={stage}
						className="glow-rail card-shadow rounded-[1.25rem]"
						style={{ transformOrigin: "50% 100%" }}
					>
						<div className="aspect-[1920/1200] overflow-hidden rounded-[inherit] bg-foreground">
							<video
								aria-label="Kontinue AI conversation import demo"
								autoPlay
								className="block size-full object-cover"
								disablePictureInPicture
								disableRemotePlayback
								loop
								muted
								playsInline
								poster={DEMO_POSTER}
								preload="auto"
								src={DEMO_SRC}
								width={1920}
								height={1200}
							>
								<track kind="captions" />
							</video>
						</div>
					</div>
				</div>
			</div>

			<div className="relative mx-auto mt-16 max-w-6xl px-5 lg:mt-20 lg:px-8">
				<div className="flex flex-col items-center gap-x-10 gap-y-5 border-t border-border py-8 xl:flex-row xl:justify-between">
					<p className="shrink-0 text-sm text-muted-foreground">
						Continue on K-AI 1.0 or models from
					</p>
					<ul
						aria-label="Supported AI model providers"
						className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4"
					>
						{modelLogos
							.filter((model) => model.name !== "K-AI 1.0")
							.map((model) => (
								<li
									key={model.name}
									className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
								>
									<Image
										src={model.src}
										alt=""
										width={20}
										height={20}
										className="size-5 object-contain opacity-70 grayscale"
									/>
									{model.name}
								</li>
							))}
					</ul>
				</div>
			</div>
		</section>
	);
}
