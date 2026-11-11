// Per-chat context usage, behind the composer's context meter.
//
// Three numbers can describe the same chat, in order of trust:
//   1. reported — total tokens the provider actually counted on the last turn
//      (system prompt + tool schemas + history + reply). Persisted, so a restart
//      keeps the real number instead of a chars/4 guess.
//   2. estimate — chars/4 of the persisted history. Cheap, available as soon as
//      the chat's messages have loaded.
//   3. unknown — the chat's history hasn't come back from Convex yet.
//
// Case 3 is what made the meter flash "0%" on every chat switch: PlanView
// unmounts when you leave the Kode tab and Convex returns `undefined` until the
// new chat's query resolves, so component state had nothing to show. The state
// therefore lives here, outside React (module scope + localStorage), keyed by
// chat id, and survives both a tab switch and a remount.
import type { LanguageModelUsage } from "ai";
import { useSyncExternalStore } from "react";

export type ChatContextUsage = {
  /** Provider-reported total tokens for the last turn of this chat. */
  reported?: number;
  /** Usage from the last turn this session, for the meter's cost footer. */
  usage?: LanguageModelUsage;
  /** Last estimate for this chat, kept so a switch-back has something to show. */
  estimate?: number;
};

const STORAGE_KEY = "kontinue.kode.context-tokens";

/** The value persisted for each chat (only `reported` is worth keeping). */
function loadPersisted(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, number> = {};
    for (const [chatId, tokens] of Object.entries(parsed)) {
      if (typeof tokens === "number" && Number.isFinite(tokens) && tokens > 0) {
        out[chatId] = tokens;
      }
    }
    return out;
  } catch {
    return {};
  }
}

const usage: Record<string, ChatContextUsage> = Object.fromEntries(
  Object.entries(loadPersisted()).map(([chatId, reported]) => [
    chatId,
    { reported } as ChatContextUsage,
  ]),
);
const listeners = new Set<() => void>();

function persist() {
  try {
    // Only real provider counts are worth persisting; estimates are recomputed
    // from the messages on load.
    const stored: Record<string, number> = {};
    for (const [chatId, info] of Object.entries(usage)) {
      if (typeof info.reported === "number") stored[chatId] = info.reported;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked: the meter still works for this session.
  }
}

function commit(chatId: string, next: ChatContextUsage | null) {
  if (next === null) {
    if (!(chatId in usage)) return;
    delete usage[chatId];
  } else {
    usage[chatId] = next;
  }
  persist();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Usage for one chat, or undefined if the chat has none yet. */
export function getChatContextUsage(
  chatId: string | null,
): ChatContextUsage | undefined {
  return chatId ? usage[chatId] : undefined;
}

/** Reactive version of {@link getChatContextUsage}. */
export function useChatContextUsage(
  chatId: string | null,
): ChatContextUsage | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (chatId ? usage[chatId] : undefined),
    () => (chatId ? usage[chatId] : undefined),
  );
}

/**
 * Remember the provider's real count for a turn. `totalTokens` is the whole
 * prompt as the provider counted it, which is what the meter should show.
 */
export function recordChatContextUsage(
  chatId: string,
  next: LanguageModelUsage,
) {
  const total = next.totalTokens;
  if (typeof total !== "number" || !Number.isFinite(total)) return;
  const previous = usage[chatId];
  if (previous?.reported === total && previous.usage === next) return;
  commit(chatId, { reported: total, usage: next });
}

/**
 * Keep the latest history estimate so a chat switch has a number to show before
 * Convex answers. Passing null clears it (empty chat).
 */
export function rememberChatContextEstimate(
  chatId: string,
  tokens: number | null,
) {
  const current = usage[chatId];
  if ((current?.estimate ?? null) === tokens) return;
  if (current) {
    if (tokens === null) {
      const { estimate: _dropped, ...rest } = current;
      commit(chatId, Object.keys(rest).length > 0 ? rest : null);
      return;
    }
    commit(chatId, { ...current, estimate: tokens });
    return;
  }
  if (tokens !== null) commit(chatId, { estimate: tokens });
}

/**
 * Drop the provider's real count but keep the estimate: the history changed in a
 * way the provider's last number no longer describes (a CLI turn, which is
 * counted by the CLI's own prompt, not ours).
 */
export function clearReportedChatContextUsage(chatId: string) {
  const current = usage[chatId];
  if (!current || current.reported === undefined) return;
  const { reported: _reported, usage: _usage, ...rest } = current;
  commit(chatId, Object.keys(rest).length > 0 ? rest : null);
}

/**
 * Forget a chat entirely: its history was cut back (rewind/edit) or the chat was
 * deleted, so the last reported total no longer applies.
 */
export function forgetChatContextUsage(chatId: string) {
  commit(chatId, null);
}

/**
 * Context used by a chat's meter: the provider's count when we have it, else the
 * last estimate, else 0 (a chat with no history yet).
 */
export function contextTokensFor(info: ChatContextUsage | undefined): number {
  return info?.reported ?? info?.estimate ?? 0;
}
