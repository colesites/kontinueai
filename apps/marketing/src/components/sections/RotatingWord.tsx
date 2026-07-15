"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";

/**
 * Cycles through `words` in place with a gentle fade-and-rise swap.
 * Uses a stacked grid so the slot reserves the widest word's width and
 * nothing around it reflows. Falls back to the first word when JS is off
 * or reduced motion is requested.
 */
export function RotatingWord({
	words,
	className,
}: {
	words: string[];
	className?: string;
}) {
	const ref = useRef<HTMLSpanElement>(null);

	useGSAP(
		() => {
			const items = gsap.utils.toArray<HTMLElement>("[data-word]", ref.current);
			if (items.length <= 1) return;

			gsap.set(items, { autoAlpha: 0, y: 6 });
			gsap.set(items[0], { autoAlpha: 1, y: 0 });

			const reduced = window.matchMedia(
				"(prefers-reduced-motion: reduce)",
			).matches;
			if (reduced) return;

			let activeIndex = 0;
			let cancelled = false;
			let cycle: ReturnType<typeof gsap.timeline> | undefined;

			const rotate = () => {
				if (cancelled) return;

				const nextIndex = (activeIndex + 1) % items.length;
				const current = items[activeIndex];
				const next = items[nextIndex];

				cycle = gsap.timeline({
					delay: 1.8,
					onComplete: () => {
						activeIndex = nextIndex;
						rotate();
					},
				});
				cycle
					.to(current, {
						autoAlpha: 0,
						y: -6,
						duration: 0.35,
						ease: "power2.in",
					})
					.fromTo(
						next,
						{ autoAlpha: 0, y: 6 },
						{ autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out" },
					);
			};

			rotate();

			return () => {
				cancelled = true;
				cycle?.kill();
			};
		},
		{ scope: ref },
	);

	return (
		<span ref={ref} data-rotate className="inline-grid">
			{words.map((word) => (
				<span
					key={word}
					data-word
					className={`col-start-1 row-start-1 justify-self-start ${className ?? ""}`}
				>
					{word}
				</span>
			))}
		</span>
	);
}
