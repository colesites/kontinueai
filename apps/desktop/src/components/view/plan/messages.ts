// Kode chat messages as the view holds them, and conversions to and from what
// Convex stores and what the model is sent.

import { KODE_MODELS, type KodePlan } from "@repo/ai/lib/kode";
import type { StagedAttachment } from "@/components/chat/ChatInput";
import type { KodeConvexMessage } from "@/lib/convex-api";
import type { KodeToolStep } from "@/lib/kode-agent";
import { splitUserAttachments } from "@/lib/kode-attachments";
import { cliModelDisplayName } from "@/lib/kode-cli";
import type { LimitHit } from "@/lib/kode-limits";
import { stripLeftoverToolMarkup } from "@/lib/kode-sanitize";
import { condenseSteps } from "@/lib/kode-steps";
import type { KodeAgentMode, KodeTodo } from "@/lib/kode-tools";
import type { KodeWorkspaceMessage } from "@/lib/kode-workspace";

export type ChatMessage = KodeWorkspaceMessage & {
  // Ephemeral agent tool steps (live during a run, not persisted).
  toolSteps?: KodeToolStep[];
  // Plan/todos — now persisted in Convex message metadata.
  toolTodos?: KodeTodo[];
  // Imported retry/limit events render as system notices, not chat bubbles.
  notice?: boolean;
  // Already saved to Convex (the user's message is saved when it is sent), so
  // the persisted copy shows instead of this one.
  saved?: boolean;
  // Only the usage-limit card: the turn it stopped is already saved.
  limitCard?: boolean;
  // The turn stopped on a usage limit: what to resend, and when it resets.
  limit?: {
    resetAt: number | null;
    text: string;
    modelId: string;
    mode: KodeAgentMode;
    attachments?: StagedAttachment[];
  };
};

/** A turn that stopped on a usage limit (see src/lib/kode-limits.ts). */
export class KodeLimitError extends Error {
  constructor(readonly limit: LimitHit) {
    super(limit.message);
  }
}

// A user message's text and attachments, parsed once per distinct message.
const userPartsCache = new Map<string, ReturnType<typeof splitUserAttachments>>();
export function userParts(content: string) {
  let parts = userPartsCache.get(content);
  if (!parts) {
    parts = splitUserAttachments(content);
    if (userPartsCache.size > 500) userPartsCache.clear();
    userPartsCache.set(content, parts);
  }
  return parts;
}

export const getModelName = (modelId: string) =>
  cliModelDisplayName(modelId) ??
  KODE_MODELS.find((model) => model.id === modelId)?.name ??
  "Kode 1.0";

export const normalizePlanTier = (tier: string): KodePlan =>
  tier === "starter" || tier === "plus" || tier === "pro" || tier === "max"
    ? tier
    : "free";

export function isImportedTerminalDump(content: string) {
  // Kode's own replies keep their tool steps in ```kode-steps / ```kode-tool
  // blocks, which hold tool ids and command output ("exit code") too. Those
  // render as steps, not as one "Ran:" line of raw JSON.
  if (/```kode-(steps|tool)\b/.test(content)) return false;
  return (
    /toolu_[A-Za-z0-9]+/.test(content) &&
    /background command|exit code|task-notification/i.test(content)
  );
}

export function importedTerminalNotice(content: string) {
  const summary = content.match(
    /Background command[\s\S]*?\(exit code \d+\)/i,
  )?.[0];
  return `Ran: ${summary ?? content.replace(/\s+/g, " ").trim()}`;
}

/** Messages per page of chat history. */
export const HISTORY_PAGE = 60;

export function toChatMessage(message: KodeConvexMessage, fallbackModel: string): ChatMessage {
  const meta = message.metadata as { model?: string; todos?: KodeTodo[] } | undefined;
  const isNotice = message.role === "system";
  return {
    id: message._id,
    role: isNotice ? "assistant" : message.role === "assistant" ? "assistant" : "user",
    content: message.role === "assistant" ? stripLeftoverToolMarkup(message.content) : message.content,
    modelId: meta?.model ?? fallbackModel,
    createdAt: message.createdAt,
    status: "complete",
    notice: isNotice,
    toolTodos: meta?.todos,
  };
}

/** Chat turns as the model sees them (no notices, steps condensed). */
export function toModelHistory(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages.flatMap((message) => {
    if (message.notice || !message.content) return [];
    if (message.role !== "user" && message.role !== "assistant") return [];
    return [{ role: message.role, content: condenseSteps(message.content) }];
  });
}
