/**
 * In-memory handoff of the first prompt from the home composer to the chat
 * screen (mirrors @repo/core/pending-chat-draft, which uses sessionStorage on
 * web). Module-level state is fine here: the draft only needs to survive a
 * single navigation within one app session.
 */
import type { PendingAttachment } from "@/lib/chat-attachments";

export interface PendingChatDraft {
  text: string;
  model?: string;
  webSearchEnabled?: boolean;
  attachments?: PendingAttachment[];
}

const drafts = new Map<string, PendingChatDraft>();

export function savePendingChatDraft(chatId: string, draft: PendingChatDraft) {
  drafts.set(chatId, draft);
}

export function consumePendingChatDraft(
  chatId: string,
): PendingChatDraft | null {
  const draft = drafts.get(chatId);
  if (!draft) return null;
  drafts.delete(chatId);
  if (
    typeof draft.text !== "string" ||
    (!draft.text.trim() && !draft.attachments?.length)
  )
    return null;
  return draft;
}
