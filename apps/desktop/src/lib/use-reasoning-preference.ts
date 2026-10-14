import { useCallback, useState } from "react";
import {
  readCachedReasoningEnabled,
  writeCachedReasoningEnabled,
} from "@repo/core/reasoning-preference";

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
