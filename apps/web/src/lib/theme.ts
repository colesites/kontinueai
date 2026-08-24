export const THEMES = [
	"normal",
	"pink",
	"emerald",
	"chelsea",
	"amethyst",
] as const;
export type Theme = (typeof THEMES)[number];

const THEME_STORAGE_KEY = "ui-theme";
const THEME_ONBOARDING_KEY = "theme-onboarding-completed";

const THEME_LABELS: Record<Theme, string> = {
	normal: "Default",
	pink: "Pink",
	emerald: "Emerald",
	chelsea: "Chelsea Blue",
	amethyst: "Amethyst",
};
const THEME_PRIMARY_COLORS: Record<Theme, string> = {
	normal: "#000000",
	pink: "#e91e63",
	emerald: "#10b981",
	chelsea: "oklch(0.420 0.205 266)",
	amethyst: "oklch(0.603 0.267 316.3767413595733)",
};

export function setColorTheme(theme: Theme) {
	if (typeof window === "undefined") return;

	const html = document.documentElement;

	// Remove all theme classes
	THEMES.forEach((t) => {
		html.classList.remove(`theme-${t}`);
	});
	// Backward compatibility for an older id used during development.
	html.classList.remove("theme-chelsea-blue");

	// The normal theme is also the CSS fallback, but retaining its class makes
	// an explicit user choice clear and keeps theme handling consistent.
	html.classList.add(`theme-${theme}`);
	html.setAttribute("data-color-theme", theme);

	// Persist to localStorage
	try {
		localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch (e) {
		console.error("Failed to save theme preference:", e);
	}
}

export function getSavedTheme(): Theme | null {
	if (typeof window === "undefined") return null;

	try {
		const saved = localStorage.getItem(THEME_STORAGE_KEY);
		// Preserve existing users' chosen pink theme after the default changed.
		if (saved === "default") {
			return "pink";
		}
		if (saved === "chelsea-blue") {
			return "chelsea";
		}
		if (saved && THEMES.includes(saved as Theme)) {
			return saved as Theme;
		}
	} catch (e) {
		console.error("Failed to read theme preference:", e);
	}

	return null;
}

export function hasCompletedThemeOnboarding(): boolean {
	if (typeof window === "undefined") return false;

	try {
		return localStorage.getItem(THEME_ONBOARDING_KEY) === "true";
	} catch {
		return false;
	}
}

export function markThemeOnboardingComplete() {
	if (typeof window === "undefined") return;

	try {
		localStorage.setItem(THEME_ONBOARDING_KEY, "true");
	} catch (e) {
		console.error("Failed to save onboarding state:", e);
	}
}

export function getThemeLabel(theme: Theme): string {
	return THEME_LABELS[theme];
}

export function getThemePrimaryColor(theme: Theme): string {
	return THEME_PRIMARY_COLORS[theme];
}
