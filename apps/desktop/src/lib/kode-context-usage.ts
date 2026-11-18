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

/**
 * Who counted `reported`: a CLI agent (Claude Code, Codex, ACP) counts its own
 * session's prompt; the in-app API path counts the history Kontinue sends.
 * The two describe different prompts, so a count from one is not shown when
 * the chat's selected model would use the other.
 */
export type ContextUsageSource = "cli" | "api";

export type ChatContextUsage = {
  /** Provider-reported total tokens for the last turn of this chat. */
  reported?: number;
  /** Where `reported` came from. Missing on counts saved by older builds. */
  source?: ContextUsageSource;
  /** Usage from the last turn this session, for the meter's cost footer. */
  usage?: LanguageModelUsage;
  /** Last estimate for this chat, kept so a switch-back has something to show. */
  estimate?: number;
};

const STORAGE_KEY = "kontinue.kode.context-tokens";

type PersistedUsage = { reported: number; source?: ContextUsageSource };

/**
 * The value persisted for each chat (only `reported` and its source are worth
 * keeping). Older builds stored a bare number; those load without a source.
 */
function loadPersisted(): Record<string, PersistedUsage> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, PersistedUsage> = {};
    for (const [chatId, value] of Object.entries(parsed)) {
      const tokens =
        typeof value === "number" ? value : (value as { reported?: unknown } | null)?.reported;
      if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) continue;
      const source = (value as { source?: unknown } | null)?.source;
      out[chatId] = {
        reported: tokens,
        ...(source === "cli" || source === "api" ? { source } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

const usage: Record<string, ChatContextUsage> = Object.fromEntries(
  Object.entries(loadPersisted()).map(([chatId, saved]) => [
    chatId,
    { ...saved } as ChatContextUsage,
  ]),
);
const listeners = new Set<() => void>();

function persist() {
  try {
    // Only real provider counts are worth persisting; estimates are recomputed
    // from the messages on load.
    const stored: Record<string, PersistedUsage> = {};
    for (const [chatId, info] of Object.entries(usage)) {
      if (typeof info.reported === "number") {
        stored[chatId] = {
          reported: info.reported,
          ...(info.source ? { source: info.source } : {}),
        };
      }
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
 *
 * For a CLI agent that count is its own session's prompt (system prompt, tool
 * schemas, files it read, tool results, compaction), which is the truth for
 * that chat until its next turn reports again. It must NOT be cleared when the
 * turn ends: falling back to the chars/4 estimate of the saved message text
 * (no tool calls, no tool output, no system prompt) is what made the meter read
 * 60% mid-run and then collapse to 1-3% the moment the reply finished.
 */
export function recordChatContextUsage(
  chatId: string,
  next: LanguageModelUsage,
  source: ContextUsageSource = "api",
) {
  const total = next.totalTokens;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) return;
  const previous = usage[chatId];
  if (
    previous?.reported === total &&
    previous.source === source &&
    previous.usage === next
  ) {
    return;
  }
  commit(chatId, { ...previous, reported: total, source, usage: next });
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
 * Forget a chat entirely: its history was cut back (rewind/edit) or the chat was
 * deleted, so the last reported total no longer applies.
 */
export function forgetChatContextUsage(chatId: string) {
  commit(chatId, null);
}

/**
 * Context used by a chat's meter: the provider's count when we have it, else the
 * last estimate, else 0 (a chat with no history yet).
 *
 * `route` is how the chat's selected model would send the next turn. A count
 * from the other route describes a different prompt, so the estimate is used
 * instead. Counts saved before sources were recorded are trusted either way.
 */
export function contextTokensFor(
  info: ChatContextUsage | undefined,
  route?: ContextUsageSource,
): number {
  const reportedApplies =
    info?.reported !== undefined &&
    (!route || !info.source || info.source === route);
  return (reportedApplies ? info?.reported : undefined) ?? info?.estimate ?? 0;
}

/** Same percentage text everywhere the meter appears (footer, popover). */
export function formatContextPercent(used: number, max: number): string {
  const ratio = max > 0 ? used / max : 0;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(ratio);
}
