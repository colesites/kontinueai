export const CHAT_SCROLL_CONTAINER_ID = "chat-scroll-container";

const CHAT_TURN_ANCHOR_PREFIX = "chat-turn-";

export type ChatTurn = {
  id: string;
  preview: string;
};

export function getChatTurnAnchorId(turnId: string): string {
  return `${CHAT_TURN_ANCHOR_PREFIX}${turnId}`;
}
