export interface PendingChatDraft {
  text: string;
  model?: string;
  webSearchEnabled?: boolean;
  imageAspectRatio?: string;
  imageSize?: string | null;
}

const PENDING_CHAT_DRAFT_KEY_PREFIX = "continue-ai:pending-chat-draft:";

function getStorageKey(chatId: string): string {
  return `${PENDING_CHAT_DRAFT_KEY_PREFIX}${chatId}`;
}

export function savePendingChatDraft(chatId: string, draft: PendingChatDraft): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(getStorageKey(chatId), JSON.stringify(draft));
}

export function consumePendingChatDraft(chatId: string): PendingChatDraft | null {
  if (typeof window === "undefined") return null;
  const key = getStorageKey(chatId);
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  sessionStorage.removeItem(key);

  try {
    const parsed = JSON.parse(raw) as PendingChatDraft;
    if (!parsed || typeof parsed.text !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
