import { useCallback, useEffect, useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

/**
 * Thinking (reasoning) toggle, mirroring web's useReasoningPreference: one
 * device-wide choice that survives app restarts and applies to every chat.
 * Web keeps it in localStorage; SecureStore is the native equivalent here.
 * Defaults to on, like web.
 */

const STORAGE_KEY = "kontinue.reasoning-enabled";

let cached: boolean | null = null;
let hydrating = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function hydrate() {
  if (cached !== null || hydrating) return;
  hydrating = true;
  SecureStore.getItemAsync(STORAGE_KEY)
    .then((value) => {
      if (cached !== null) return;
      if (value === "1" || value === "0") {
        cached = value === "1";
        emit();
      }
    })
    .catch(() => {
      // Secure storage can be unavailable in a restricted dev shell.
    })
    .finally(() => {
      hydrating = false;
    });
}

function write(next: boolean) {
  cached = next;
  emit();
  void SecureStore.setItemAsync(STORAGE_KEY, next ? "1" : "0").catch(() => {});
}

export function useReasoningPreference() {
  const stored = useSyncExternalStore(
    subscribe,
    () => cached,
    () => cached,
  );

  useEffect(() => {
    hydrate();
  }, []);

  const reasoningEnabled = stored ?? true;

  const setReasoningEnabled = useCallback((next: boolean) => write(next), []);
  const toggleReasoning = useCallback(
    () => write(!(cached ?? true)),
    [],
  );

  return { reasoningEnabled, setReasoningEnabled, toggleReasoning };
}
