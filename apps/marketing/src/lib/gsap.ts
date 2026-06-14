"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Register plugins on the client (registerPlugin is idempotent).
if (typeof window !== "undefined") {
	gsap.registerPlugin(ScrollTrigger, useGSAP);
}

export const EASE = "power3.out";
export const EASE_EXPO = "expo.out";

export { gsap, ScrollTrigger, useGSAP };
