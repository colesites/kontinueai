"use client";

import Lenis from "lenis";
import { useEffect } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { setLenis } from "@/lib/scroll";

/**
 * Lenis-powered momentum scrolling, synced to GSAP's ticker and ScrollTrigger.
 * Disabled entirely when the user prefers reduced motion.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		const reduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		if (reduced) return;

		const lenis = new Lenis({
			duration: 1.1,
			easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
			smoothWheel: true,
			touchMultiplier: 1.6,
		});

		setLenis(lenis);
		lenis.on("scroll", ScrollTrigger.update);

		const raf = (time: number) => lenis.raf(time * 1000);
		gsap.ticker.add(raf);
		gsap.ticker.lagSmoothing(0);

		return () => {
			gsap.ticker.remove(raf);
			lenis.destroy();
			setLenis(null);
		};
	}, []);

	return <>{children}</>;
}
