// Local mirror of the user's persisted Web Search toggle.
//
// Convex is the source of truth — that is what makes the toggle follow a person
// across devices. This cache exists only so the toggle paints in the right
// state on first render instead of flashing the default while the query
// resolves. Every write goes to both.

const WEB_SEARCH_STORAGE_KEY = "kontinue.web-search-enabled";

export function readCachedWebSearchEnabled(): boolean | null {
	if (typeof window === "undefined") return null;

	try {
		const value = window.localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
		if (value === "1") return true;
		if (value === "0") return false;
		return null;
	} catch {
		return null;
	}
}

export function writeCachedWebSearchEnabled(enabled: boolean): void {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.setItem(WEB_SEARCH_STORAGE_KEY, enabled ? "1" : "0");
	} catch {
		// Ignore storage failures; Convex still holds the canonical value.
	}
}
