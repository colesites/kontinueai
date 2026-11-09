// Stashed composer drafts: ⌘S puts the current draft aside so you can drop it
// into another chat later. Shared by every chat, kept across restarts.

import { useSyncExternalStore } from "react";

export type StashedDraft = { id: string; text: string; createdAt: number };

const STORAGE_KEY = "kode.stash";
const MAX_ITEMS = 30;
const EMPTY: StashedDraft[] = [];

let items: StashedDraft[] = load();
const listeners = new Set<() => void>();

function load(): StashedDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as StashedDraft[]) : [];
    return Array.isArray(parsed) && parsed.length ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

function commit(next: StashedDraft[]) {
  items = next.length ? next : EMPTY;
  try {
    if (items.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: keep the stash for this session only.
  }
  for (const listener of listeners) listener();
}

export function useStash(): StashedDraft[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
  );
}

/** Newest first; an identical draft moves to the top instead of duplicating. */
export function stashDraft(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const rest = items.filter((item) => item.text.trim() !== trimmed);
  commit(
    [
      { id: `stash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, createdAt: Date.now() },
      ...rest,
    ].slice(0, MAX_ITEMS),
  );
}

export function removeStashed(id: string) {
  if (items.some((item) => item.id === id)) commit(items.filter((item) => item.id !== id));
}
