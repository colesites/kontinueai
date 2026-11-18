// "@connector" mentions in the chat composer, shared by web and Expo.

/**
 * Detects an in-progress "@token" immediately before the caret. Returns the
 * query text and the index of the "@" so callers can splice a replacement.
 */
export function detectMention(
	text: string,
	caret: number,
): { query: string; start: number } | null {
	const before = text.slice(0, caret);
	const match = before.match(/(^|\s)@(\w*)$/);
	if (!match) return null;
	const query = match[2] ?? "";
	const start = caret - query.length - 1; // index of '@'
	return { query, start };
}

/** Replaces the "@query" being typed with "@provider " and returns the caret. */
export function applyMention(
	text: string,
	mention: { query: string; start: number },
	provider: string,
): { text: string; caret: number } {
	const insert = `@${provider} `;
	const end = mention.start + 1 + mention.query.length;
	const next = `${text.slice(0, mention.start)}${insert}${text.slice(end).replace(/^ /, "")}`;
	return { text: next, caret: mention.start + insert.length };
}
