// Settings → General → Auto-archive inactive threads: Kode chats with no
// activity for N days move to Settings → Data → Archived. Pinned chats, the
// open chat and running chats are left alone. Checked hourly.

import { useEffect, useRef } from "react";
import { useAppSettings } from "./app-settings";
import { useKodeAgentRuntime } from "./kode-agent-runtime";
import { useKodeWorkspace } from "./kode-workspace";

const DAY = 86_400_000;

export function useAutoArchive() {
  const { autoArchiveInactiveDays: days } = useAppSettings();
  const { kodeChats, activeChatId, archiveKodeChat } = useKodeWorkspace();
  const { statusByChat } = useKodeAgentRuntime();
  const latest = useRef({ kodeChats, activeChatId, archiveKodeChat, statusByChat });
  latest.current = { kodeChats, activeChatId, archiveKodeChat, statusByChat };

  useEffect(() => {
    if (!days || days <= 0) return;
    const sweep = () => {
      const { kodeChats: chats, activeChatId: open, archiveKodeChat: archive, statusByChat: status } = latest.current;
      const cutoff = Date.now() - days * DAY;
      for (const chat of chats) {
        if (chat.archived || chat.pinnedAt || chat.id === open) continue;
        if (status[chat.id] && status[chat.id] !== "idle") continue;
        if (chat.updatedAt < cutoff) void archive(chat.id, true).catch(() => {});
      }
    };
    const first = window.setTimeout(sweep, 30_000);
    const timer = window.setInterval(sweep, 60 * 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [days]);
}
