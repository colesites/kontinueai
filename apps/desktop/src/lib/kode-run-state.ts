// In-flight Kode turns, kept outside React.
//
// PlanView unmounts whenever you leave the Kode tab, open another screen or
// the window reloads its view. Its in-flight state (the bubbles for a running
// turn, which chats are sending, the Stop controller) used to live in
// component state, so coming back showed the chat without the turn that was
// still running, the Stop button did nothing and a second message could start
// a parallel run in the same chat. The run itself kept going in the
// background and wrote to state nobody was reading.
//
// Each field here is a module-level record with the same updater API as
// useState, so the running turn keeps writing to it and any mounted view
// reads the live value.

import { useCallback, useSyncExternalStore } from "react";

type Updater<T> = T | ((current: T) => T);

export type RunSlot<T> = {
  get: () => T;
  set: (next: Updater<T>) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createRunSlot<T>(initial: T): RunSlot<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      const resolved = typeof next === "function" ? (next as (current: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** useState over a shared slot: same tuple, but the value outlives the component. */
export function useRunSlot<T>(slot: RunSlot<T>): [T, (next: Updater<T>) => void] {
  const value = useSyncExternalStore(slot.subscribe, slot.get, slot.get);
  const set = useCallback((next: Updater<T>) => slot.set(next), [slot]);
  return [value, set];
}

/** Abort controllers for running turns, by chat id (or the draft key). */
export const runAborts = new Map<string, AbortController>();

/** The permission mode each running turn should use now, by chat id. The
 *  picker writes it; the agent reads it before every step. */
export const liveModes = new Map<string, string>();

/**
 * Collect streamed text and hand it over in batches. A model sends a delta
 * per token (30 to 100 a second); applying each one re-rendered the whole
 * conversation, which made long chats stutter while a reply streamed. This
 * keeps the order of fields and flushes at most every `ms`.
 */
export function createDeltaBatcher<K extends string>(
  apply: (key: K, text: string) => void,
  ms = 50,
) {
  const pending = new Map<K, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const entries = [...pending.entries()];
    pending.clear();
    for (const [key, text] of entries) if (text) apply(key, text);
  };
  return {
    push(key: K, text: string) {
      pending.set(key, (pending.get(key) ?? "") + text);
      timer ??= setTimeout(flush, ms);
    },
    /** Apply everything now (before a tool card, the end of the turn, an error). */
    flush,
  };
}
