import { api } from "@repo/convex/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";

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

	// Optimistic value so the toggle responds instantly. It only applies while
	// the server still reports the value it had when the toggle was pressed;
	// once Convex confirms (or another device changes it), Convex wins. Derived
	// in render rather than cleared from an effect.
	const [pending, setPending] = useState<{
		value: boolean;
		from: boolean | null | undefined;
	} | null>(null);
	const optimistic =
		pending && pending.from === persisted ? pending.value : null;

	const webSearchEnabled = optimistic ?? persisted ?? false;

	const setWebSearchEnabled = useCallback(
		(next: boolean) => {
			setPending({ value: next, from: persisted });
			void save({ enabled: next }).catch((error) => {
				// Drop the optimistic value so the toggle shows the real state.
				setPending(null);
				console.warn("Failed to persist web search toggle:", error);
			});
		},
		[persisted, save],
	);

	const toggleWebSearch = useCallback(() => {
		setWebSearchEnabled(!webSearchEnabled);
	}, [webSearchEnabled, setWebSearchEnabled]);

	return { webSearchEnabled, setWebSearchEnabled, toggleWebSearch };
}
