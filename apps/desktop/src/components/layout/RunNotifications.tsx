// Turns Kode run status changes into notifications (lib/kode-notify.ts) and
// shows in-app toasts. Mounted once in ViewLayout.

import { useEffect, useRef } from "react";
import { AlarmClock, AlertCircle, CheckCircle2, HelpCircle, X } from "lucide-react";
import { useKodeAgentRuntime, type ChatRunStatus } from "@/lib/kode-agent-runtime";
import { dismissToast, notifyRunEvent, setNotifyContext, useToasts, type RunEventKind } from "@/lib/kode-notify";
import { useKodeWorkspace } from "@/lib/kode-workspace";

const ICON: Record<RunEventKind, typeof CheckCircle2> = {
  finished: CheckCircle2,
  failed: AlertCircle,
  limit: AlarmClock,
  awaiting: HelpCircle,
};

export function RunNotifications() {
  const { statusByChat } = useKodeAgentRuntime();
  const { kodeChats, activeChatId, activeTab, setActiveTab, selectChat } = useKodeWorkspace();
  const previous = useRef<Record<string, ChatRunStatus>>({});
  const toasts = useToasts();

  useEffect(() => {
    setNotifyContext(
      activeTab === "kode" ? activeChatId : null,
      Object.fromEntries(kodeChats.map((chat) => [chat.id, chat.title])),
    );
  }, [activeChatId, activeTab, kodeChats]);

  useEffect(() => {
    const before = previous.current;
    for (const [chatId, status] of Object.entries(statusByChat)) {
      const was = before[chatId];
      if (chatId === "draft" || was === status) continue;
      if (status === "awaiting") notifyRunEvent({ chatId, kind: "awaiting" });
      else if (status === "idle" && (was === "running" || was === "awaiting")) notifyRunEvent({ chatId, kind: "finished" });
    }
    previous.current = statusByChat;
  }, [statusByChat]);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = ICON[toast.kind];
        return (
          <div key={toast.id} className="liquid-glass-dropdown pointer-events-auto flex items-start gap-3 !rounded-[18px] p-3 text-foreground">
            <Icon size={15} className={toast.kind === "finished" ? "mt-0.5 text-emerald-500" : toast.kind === "awaiting" ? "mt-0.5 text-purple-500" : "mt-0.5 text-amber-500"} />
            <button
              type="button"
              className="min-w-0 flex-1 cursor-pointer text-left"
              onClick={() => {
                if (toast.chatId) {
                  setActiveTab("kode");
                  selectChat(toast.chatId);
                }
                dismissToast(toast.id);
              }}
            >
              <p className="truncate text-body font-medium">{toast.title}</p>
              <p className="line-clamp-2 text-label text-muted-foreground">{toast.body}</p>
            </button>
            <button type="button" aria-label="Dismiss" onClick={() => dismissToast(toast.id)} className="cursor-pointer text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
