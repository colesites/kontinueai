/**
 * Animation configuration utilities for Motion library
 * Provides common animation patterns and motion preferences detection
 */

// Check if user prefers reduced motion
export const prefersReducedMotion = (): boolean => {
	if (typeof window === "undefined") return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

// Common animation variants
export const fadeIn = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
};

export const slideUp = {
	initial: { opacity: 0, y: 20 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: 20 },
};

export const slideDown = {
	initial: { opacity: 0, y: -20 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -20 },
};

export const scaleIn = {
	initial: { opacity: 0, scale: 0.95 },
	animate: { opacity: 1, scale: 1 },
	exit: { opacity: 0, scale: 0.95 },
};

// Stagger configuration for child animations
export const staggerContainer = {
	animate: {
		transition: {
			staggerChildren: 0.1,
		},
	},
};

export const staggerItem = {
	initial: { opacity: 0, y: 20 },
	animate: { opacity: 1, y: 0 },
};

// Transition configurations
export const springTransition = {
	type: "spring" as const,
	stiffness: 260,
	damping: 20,
};

export const easeTransition = {
	duration: 0.3,
	ease: [0.4, 0, 0.2, 1] as const,
};

// Helper to get animation config based on reduced motion preference
export const getAnimationConfig = <T extends Record<string, unknown>>(
	animation: T,
): T | Record<string, never> => {
	return prefersReducedMotion() ? {} : animation;
};
