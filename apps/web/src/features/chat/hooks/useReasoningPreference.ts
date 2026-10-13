"use client";

import {
	readCachedReasoningEnabled,
	writeCachedReasoningEnabled,
} from "@repo/core/reasoning-preference";
import { useCallback, useState } from "react";

/**
 * Reasoning (thinking) toggle preference.
 *
 * Persisted in localStorage so that when a user turns reasoning on or off,
 * it stays consistent across chats and sessions.
 * Defaults to true for reasoning models.
 */
export function useReasoningPreference() {
	const [reasoningEnabled, setReasoningEnabledState] = useState<boolean>(
		() => readCachedReasoningEnabled() ?? true,
	);

	const setReasoningEnabled = useCallback((next: boolean) => {
		setReasoningEnabledState(next);
		writeCachedReasoningEnabled(next);
	}, []);

	const toggleReasoning = useCallback(() => {
		setReasoningEnabledState((prev) => {
			const next = !prev;
			writeCachedReasoningEnabled(next);
			return next;
		});
	}, []);

	return {
		reasoningEnabled,
		setReasoningEnabled,
		toggleReasoning,
	};
}
