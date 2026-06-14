"use client";

import { createElement, type ElementType, type ReactNode, useRef } from "react";
import { EASE, gsap, useGSAP } from "@/lib/gsap";

type RevealProps = React.HTMLAttributes<HTMLElement> & {
	as?: ElementType;
	children: ReactNode;
	/** Vertical offset of the entrance, in px. */
	y?: number;
	/** Horizontal offset of the entrance, in px. */
	x?: number;
	scale?: number;
	delay?: number;
	duration?: number;
	/** ScrollTrigger start position. */
	start?: string;
	/**
	 * When set, the element is treated as a container and its direct
	 * children marked `data-anim` are revealed in sequence by this amount.
	 */
	stagger?: number;
};

/**
 * Scroll-triggered entrance. Pairs with the `.gsap [data-anim]` CSS guard so
 * content never flashes before the animation runs, and stays fully visible
 * when JS is off or reduced motion is requested.
 */
export function Reveal({
	as: Tag = "div",
	children,
	y = 26,
	x = 0,
	scale,
	delay = 0,
	duration = 0.9,
	start = "top 84%",
	stagger,
	...rest
}: RevealProps) {
	const ref = useRef<HTMLElement>(null);

	useGSAP(
		() => {
			const el = ref.current;
			if (!el) return;

			const from: gsap.TweenVars = { autoAlpha: 0, y, x };
			if (scale != null) from.scale = scale;
			const to: gsap.TweenVars = {
				autoAlpha: 1,
				y: 0,
				x: 0,
				scale: 1,
				duration,
				ease: EASE,
				delay,
			};

			if (stagger != null) {
				const items = gsap.utils.toArray<HTMLElement>(
					el.querySelectorAll(":scope > [data-anim]"),
				);
				if (!items.length) return;
				gsap.fromTo(items, from, {
					...to,
					stagger,
					scrollTrigger: { trigger: el, start, once: true },
				});
				return;
			}

			gsap.fromTo(el, from, {
				...to,
				scrollTrigger: { trigger: el, start, once: true },
			});
		},
		{ scope: ref },
	);

	return createElement(
		Tag,
		{
			ref,
			...(stagger == null ? { "data-anim": "" } : {}),
			...rest,
		},
		children,
	);
}
