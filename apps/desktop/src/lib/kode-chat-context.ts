// The active Kode chat's context usage, published by PlanView (which owns the
// meter) so the workspace panel's Environment tab can show it too.
import { useSyncExternalStore } from "react";

export type ChatContextInfo = {
  used: number;
  max: number;
  modelName: string;
  /** Picks whose plan the usage section shows (Kontinue or the user's agent). */
  modelId: string;
};

let current: ChatContextInfo | null = null;
const listeners = new Set<() => void>();

export function publishChatContext(info: ChatContextInfo | null) {
  if (
    current?.used === info?.used &&
    current?.max === info?.max &&
    current?.modelName === info?.modelName &&
    current?.modelId === info?.modelId
  ) {
    return;
  }
  current = info;
  for (const listener of listeners) listener();
}

export function useChatContext(): ChatContextInfo | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}
