"use client";

import { api } from "@repo/convex/convex/_generated/api";
import {
	readCachedWebSearchEnabled,
	writeCachedWebSearchEnabled,
} from "@repo/core/web-search-preference";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";

/**
 * The Web Search toggle, persisted on the user's account.
 *
 * Deliberately NOT per-chat and NOT per-tab: whichever state a person picks is
 * the state they get in the next chat, after closing the tab, and on their
 * other devices. Convex holds the canonical value and pushes updates to every
 * open session; localStorage only pre-paints the toggle so it doesn't flash the
 * default on first render.
 *
 * On forces a search on every message. Off does not disable web search — the
 * message still gets searched when it needs live data (see the chat route's
 * web-search policy), and either way the search counts against the quota.
 */
export function useWebSearchPreference() {
	const persisted = useQuery(api.users.getWebSearchEnabled, {});
	const save = useMutation(api.users.setWebSearchEnabled);

	// Optimistic local value: set the moment the user clicks, cleared once the
	// server round-trip lands so Convex stays the source of truth (and a change
	// made on another device can take over).
	const [pending, setPending] = useState<boolean | null>(null);
	const [cached, setCached] = useState<boolean | null>(() =>
		readCachedWebSearchEnabled(),
	);

	useEffect(() => {
		if (persisted === undefined || persisted === null) return;
		setCached(persisted);
		writeCachedWebSearchEnabled(persisted);
		setPending((p) => (p === persisted ? null : p));
	}, [persisted]);

	const webSearchEnabled = pending ?? persisted ?? cached ?? false;

	const setWebSearchEnabled = useCallback(
		(next: boolean) => {
			setPending(next);
			setCached(next);
			writeCachedWebSearchEnabled(next);
			void save({ enabled: next }).catch((error) => {
				console.error("Failed to persist web search toggle:", error);
			});
		},
		[save],
	);

	const toggleWebSearch = useCallback(() => {
		setWebSearchEnabled(!webSearchEnabled);
	}, [webSearchEnabled, setWebSearchEnabled]);

	return { webSearchEnabled, setWebSearchEnabled, toggleWebSearch };
}
