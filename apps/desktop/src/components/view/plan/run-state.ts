// In-flight Kode turns, kept outside React so they survive the chat view
// unmounting (kode-run-state.ts), and checkpointed so quitting mid-reply
// doesn't lose them (kode-turn-checkpoint.ts).

import type { QueuedMessage } from "@/components/chat/QueuedMessages";
import { createRunSlot } from "@/lib/kode-run-state";
import { withSteps } from "@/lib/kode-steps";
import { throttle, writeCheckpoint } from "@/lib/kode-turn-checkpoint";
import type { ChatMessage } from "./messages";

// Key for an in-flight send started on the home page before a chat exists.
export const DRAFT_KEY = "draft";
export const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];

// Real context size per chat lives in @/lib/kode-context-usage, shared with the
// workspace panel so the meter survives a chat switch and a tab switch.

// In-flight turns, shared across mounts (see kode-run-state.ts).
export const pendingSlot = createRunSlot<Record<string, ChatMessage[]>>({});
export const sendingSlot = createRunSlot<Record<string, boolean>>({});
export const compactingSlot = createRunSlot<Record<string, boolean>>({});
export const queuedSlot = createRunSlot<Record<string, QueuedMessage[]>>({});

// Checkpoint running turns (kode-turn-checkpoint.ts) so quitting mid-reply
// doesn't lose them.
const checkpointRunningTurns = throttle(() => {
  const sending = sendingSlot.get();
  const pending = pendingSlot.get();
  for (const [chatId, running] of Object.entries(sending)) {
    if (!running || chatId === DRAFT_KEY) continue;
    const items = pending[chatId] ?? [];
    const reply = [...items].reverse().find((item) => item.role === "assistant" && !item.notice);
    if (!reply) continue;
    const user = items.find((item) => item.role === "user" && !item.saved);
    writeCheckpoint({
      chatId,
      userText: user?.content,
      reply: withSteps(reply.content, reply.toolSteps ?? []),
      todos: reply.toolTodos?.length ? reply.toolTodos : undefined,
      modelId: reply.modelId,
      at: Date.now(),
    });
  }
});
pendingSlot.subscribe(checkpointRunningTurns);
