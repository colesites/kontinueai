import { api } from "@repo/convex/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";

/**
 * The Web Search toggle, persisted on the user's account (mirrors
 * useWebSearchPreference on web).
 *
 * Not per-chat and not per-session: the state a person picks is the state they
 * get in the next chat, after force-quitting the app, and in the web app. On
 * forces a search on every message; off still searches when the message needs
 * live data, and either way it counts against the quota.
 */
export function useWebSearchPreference() {
	const persisted = useQuery(api.users.getWebSearchEnabled, {});
	const save = useMutation(api.users.setWebSearchEnabled);

	// Optimistic value so the toggle responds instantly; cleared once the server
	// confirms, leaving Convex as the source of truth.
	const [pending, setPending] = useState<boolean | null>(null);

	useEffect(() => {
		if (persisted === undefined || persisted === null) return;
		setPending((p) => (p === persisted ? null : p));
	}, [persisted]);

	const webSearchEnabled = pending ?? persisted ?? false;

	const setWebSearchEnabled = useCallback(
		(next: boolean) => {
			setPending(next);
			void save({ enabled: next }).catch((error) => {
				console.warn("Failed to persist web search toggle:", error);
			});
		},
		[save],
	);

	const toggleWebSearch = useCallback(() => {
		setWebSearchEnabled(!webSearchEnabled);
	}, [webSearchEnabled, setWebSearchEnabled]);

	return { webSearchEnabled, setWebSearchEnabled, toggleWebSearch };
}
