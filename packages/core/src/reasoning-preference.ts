// Local mirror of the user's Reasoning (thinking) toggle.
//
// Stored in localStorage so that when the user switches to or from a reasoning
// model, their choice (ON or OFF) is remembered immediately across sessions.

const REASONING_STORAGE_KEY = "kontinue.reasoning-enabled";

export function readCachedReasoningEnabled(): boolean | null {
	if (typeof window === "undefined") return null;

	try {
		const value = window.localStorage.getItem(REASONING_STORAGE_KEY);
		if (value === "1") return true;
		if (value === "0") return false;
		return null;
	} catch {
		return null;
	}
}

export function writeCachedReasoningEnabled(enabled: boolean): void {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.setItem(REASONING_STORAGE_KEY, enabled === true ? "1" : "0");
	} catch {
		// Ignore storage failures
	}
}
