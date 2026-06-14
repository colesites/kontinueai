import type Lenis from "lenis";

// Module-level handle to the active Lenis instance so any component
// (e.g. the header nav) can trigger smooth programmatic scrolling.
let instance: Lenis | null = null;

export function setLenis(next: Lenis | null) {
	instance = next;
}

export function getLenis(): Lenis | null {
	return instance;
}

const HEADER_OFFSET = -92;

/** Smooth-scroll to a hash target (e.g. "#pricing") or pixel position. */
export function scrollToTarget(target: string | number) {
	if (instance) {
		instance.scrollTo(target, { offset: HEADER_OFFSET, duration: 1.2 });
		return;
	}

	if (typeof window === "undefined") return;

	if (typeof target === "number") {
		window.scrollTo({ top: target, behavior: "smooth" });
		return;
	}

	const el = document.querySelector(target);
	if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
