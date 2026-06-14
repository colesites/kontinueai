"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Reveal } from "@/components/anim/Reveal";
import { howItWorksSteps } from "@/data/features";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

export function HowItWorks() {
	const root = useRef<HTMLElement>(null);
	const [active, setActive] = useState(0);

	useGSAP(
		() => {
			const steps = gsap.utils.toArray<HTMLElement>("[data-step]");
			steps.forEach((step, i) => {
				ScrollTrigger.create({
					trigger: step,
					start: "top 62%",
					end: "bottom 62%",
					onToggle: (self) => {
						if (self.isActive) setActive(i);
					},
				});
			});
		},
		{ scope: root },
	);

	return (
		<section
			id="how-it-works"
			ref={root}
			className="bg-background py-24 lg:py-32"
		>
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<Reveal className="max-w-2xl">
					<p className="eyebrow">How it works</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						From scattered chats to one continuous workspace
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
						Three steps to stop starting over. Import what you have, switch
						models when you want, and keep one plan for all of it.
					</p>
				</Reveal>

				<div className="mt-16 grid gap-12 lg:mt-24 lg:grid-cols-2 lg:gap-20">
					{/* Steps */}
					<div>
						{howItWorksSteps.map((step, i) => (
							<div
								key={step.index}
								data-step
								className="border-t border-border py-10 first:border-t-0 lg:min-h-[58vh] lg:flex lg:flex-col lg:justify-center"
							>
								<div className="flex items-baseline gap-4">
									<span
										className={`font-mono text-sm transition-colors duration-300 ${
											active === i ? "text-brand" : "text-muted-foreground/60"
										}`}
									>
										{step.index}
									</span>
									<div className="h-px flex-1 bg-border" />
								</div>
								<h3
									className={`font-display mt-5 text-2xl tracking-tight transition-colors duration-300 sm:text-3xl ${
										active === i ? "text-foreground" : "text-foreground/40"
									}`}
								>
									{step.title}
								</h3>
								<p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
									{step.description}
								</p>

								{/* Inline media for small screens */}
								<div className="relative mt-7 aspect-[4/3] overflow-hidden rounded-2xl border border-border card-shadow lg:hidden">
									<Image
										src={step.image}
										alt={step.title}
										fill
										sizes="100vw"
										className="object-cover"
									/>
								</div>
							</div>
						))}
					</div>

					{/* Sticky media for large screens */}
					<div className="hidden lg:block">
						<div className="sticky top-[16vh]">
							<div className="relative aspect-[4/3] overflow-hidden rounded-[1.4rem] border border-border bg-secondary card-shadow">
								{howItWorksSteps.map((step, i) => (
									<Image
										key={step.index}
										src={step.image}
										alt={step.title}
										fill
										sizes="50vw"
										className={`object-cover transition-all duration-700 ease-out ${
											active === i
												? "scale-100 opacity-100"
												: "scale-105 opacity-0"
										}`}
									/>
								))}
								<div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center gap-3 bg-gradient-to-t from-foreground/70 to-transparent p-5">
									<span className="font-mono text-xs text-background/90">
										{howItWorksSteps[active].index}
									</span>
									<span className="text-sm font-medium text-background">
										{howItWorksSteps[active].title}
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
