// What each Kode chat was set to: model, mode, reasoning and context window.
//
// Settings → General holds the defaults a new chat starts from. Once you change
// something in a chat, that chat keeps it: leaving for Settings or another chat
// and coming back shows the chat as you left it. The store lives outside React
// (module scope + localStorage) because the chat view unmounts when you leave.
import { useSyncExternalStore } from "react";
import type { KodeEffort } from "@repo/ai/lib/kode";
import type { KodeAgentMode } from "@/lib/kode-tools";

export type ChatPrefs = {
  modelId?: string;
  mode?: KodeAgentMode;
  reasoning?: KodeEffort | "off";
  /** Chosen context window in tokens; null = the model's default. */
  contextWindow?: number | null;
  /** Drafts only: the project folder whose defaults this draft started from. */
  root?: string | null;
};

const STORAGE_KEY = "kontinue.kode.chat-prefs";
/** Oldest chats are forgotten past this many (they fall back to defaults). */
const MAX_CHATS = 400;

const EMPTY: ChatPrefs = Object.freeze({}) as ChatPrefs;

function load(): Map<string, ChatPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as [string, ChatPrefs][]) : [];
    return new Map(Array.isArray(parsed) ? parsed.filter((e) => Array.isArray(e) && typeof e[0] === "string") : []);
  } catch {
    return new Map();
  }
}

// Insertion order = least recently changed first.
const prefs = load();
const listeners = new Set<() => void>();

function persist() {
  while (prefs.size > MAX_CHATS) {
    const oldest = prefs.keys().next().value;
    if (oldest === undefined) break;
    prefs.delete(oldest);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...prefs]));
  } catch {
    // Storage full or blocked: kept for this session only.
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function getChatPrefs(key: string): ChatPrefs {
  return prefs.get(key) ?? EMPTY;
}

/** Merge `patch` into the chat's prefs (undefined fields are left as they are). */
export function setChatPrefs(key: string, patch: ChatPrefs) {
  const current = prefs.get(key) ?? {};
  const next: ChatPrefs = { ...current };
  let changed = false;
  for (const [field, value] of Object.entries(patch) as [keyof ChatPrefs, ChatPrefs[keyof ChatPrefs]][]) {
    if (value === undefined || next[field] === value) continue;
    (next as Record<string, unknown>)[field] = value;
    changed = true;
  }
  if (!changed) return;
  prefs.delete(key);
  prefs.set(key, next);
  persist();
  emit();
}

/** A draft became a real chat: it keeps what the draft was set to. */
export function moveChatPrefs(from: string, to: string) {
  const draft = prefs.get(from);
  if (!draft) return;
  const { root: _root, ...kept } = draft;
  prefs.delete(from);
  prefs.delete(to);
  prefs.set(to, kept);
  persist();
  emit();
}

export function forgetChatPrefs(key: string) {
  if (!prefs.delete(key)) return;
  persist();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useChatPrefs(key: string): ChatPrefs {
  return useSyncExternalStore(
    subscribe,
    () => getChatPrefs(key),
    () => getChatPrefs(key),
  );
}
