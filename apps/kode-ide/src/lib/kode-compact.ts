// Context auto-compaction. When a conversation approaches the model's window, we
// summarize the older turns into a compact summary and keep the recent ones, so
// the chat can continue without overflowing. Original messages are NOT deleted
// (they stay in the chat/Convex); we only change what gets SENT to the model.
//
// Summarization is incremental and cached per chat: once we've summarized up to
// message N, later sends only fold in the few new "older" messages, so it's cheap.

import { sendKodeChat, type KodeChatMessage } from "./kode-chat";

// Compact when the conversation exceeds this fraction of the model's window.
const THRESHOLD = 0.85;
// How many of the most recent messages to always keep verbatim.
const KEEP_RECENT = 6;

export type CompactionState = { summary: string; covered: number };

export type CompactionCache = {
  get: () => CompactionState | null;
  set: (state: CompactionState) => void;
};

type HistoryMessage = { role: "user" | "assistant"; content: string };

// Rough token estimate (chars/4). Good enough to decide when to compact; the real
// count comes from provider usage after the turn.
export function estimateTokens(messages: { content?: string | null }[]): number {
  let chars = 0;
  for (const m of messages) chars += m.content?.length ?? 0;
  return Math.ceil(chars / 4);
}

/** Whether `history` is large enough to trigger compaction for the given window. */
export function needsCompaction(
  history: { content?: string | null }[],
  window: number,
): boolean {
  return estimateTokens(history) >= window * THRESHOLD;
}

const SUMMARY_INSTRUCTION =
  "Summarize the conversation into compact but complete context for continuing the work. Preserve: decisions made, important facts, file paths and names, code and architecture choices, the user's preferences, and any unfinished tasks. Output only the summary.";

async function summarize(
  modelId: string,
  priorSummary: string | null,
  messages: HistoryMessage[],
): Promise<string> {
  const convo = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n\n");
  const prefix = priorSummary
    ? `Existing summary so far:\n${priorSummary}\n\nNew messages to fold into it:\n`
    : `Conversation to summarize:\n`;
  const response = await sendKodeChat({
    modelId,
    messages: [{ role: "user", content: `${SUMMARY_INSTRUCTION}\n\n${prefix}${convo}` }],
  });
  return response.content || priorSummary || "";
}

/**
 * Summarize a (possibly huge) span of messages without ever sending more than the
 * model's window in one call. This matters when the user grows a chat on a large
 * window model, then switches BACK to a smaller-window model (e.g. Kode 1.0): the
 * older history can exceed that window, so we fold it in window-sized chunks.
 */
async function summarizeChunked(
  modelId: string,
  priorSummary: string | null,
  messages: HistoryMessage[],
  window: number,
): Promise<string> {
  // Leave headroom for the instruction + running summary + the model's reply.
  const budget = Math.max(2000, Math.floor(window * 0.5));
  let summary = priorSummary;
  let chunk: HistoryMessage[] = [];
  let chunkTokens = 0;

  const flush = async () => {
    if (chunk.length === 0) return;
    summary = await summarize(modelId, summary, chunk);
    chunk = [];
    chunkTokens = 0;
  };

  for (const message of messages) {
    // A single message larger than the budget is truncated for the summary only
    // (the original stays intact in the chat); otherwise it could never fit.
    const tokens = estimateTokens([message]);
    const safe =
      tokens > budget
        ? { role: message.role, content: message.content.slice(0, budget * 4) }
        : message;

    if (chunkTokens > 0 && chunkTokens + Math.min(tokens, budget) > budget) {
      await flush();
    }
    chunk.push(safe);
    chunkTokens += Math.min(tokens, budget);
  }
  await flush();

  return summary ?? "";
}

export type CompactResult = {
  messages: KodeChatMessage[];
  compacted: boolean;
};

/**
 * Return the message list to actually send to the model. If the conversation is
 * under the threshold, returns it unchanged. Otherwise returns
 * [summary-of-older, ...recent] and updates the per-chat cache.
 */
export async function compactHistory(
  history: HistoryMessage[],
  window: number,
  modelId: string,
  cache: CompactionCache,
): Promise<CompactResult> {
  const used = estimateTokens(history);
  if (used < window * THRESHOLD) {
    return { messages: history, compacted: false };
  }

  const olderEnd = Math.max(0, history.length - KEEP_RECENT);
  if (olderEnd === 0) {
    // Too few messages to compact (a single huge message) — send as-is.
    return { messages: history, compacted: false };
  }

  const recent = history.slice(olderEnd);
  const prior = cache.get();

  let summary: string;
  if (prior && prior.covered <= olderEnd) {
    const delta = history.slice(prior.covered, olderEnd);
    summary =
      delta.length === 0
        ? prior.summary
        : await summarizeChunked(modelId, prior.summary, delta, window);
  } else {
    summary = await summarizeChunked(
      modelId,
      null,
      history.slice(0, olderEnd),
      window,
    );
  }

  cache.set({ summary, covered: olderEnd });

  return {
    messages: [
      { role: "user", content: `[Summary of earlier conversation]\n${summary}` },
      ...recent,
    ],
    compacted: true,
  };
}
