// Thread notifications (Settings → General → Notifications).
//
// A Kode thread that finishes, fails, hits a limit or needs your input can
// show a macOS notification (notify_send in Rust) and/or an in-app toast.
// Events come from RunNotifications (run status changes) and PlanView
// (failures and limits, which look like an ordinary finish otherwise).

import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { getSettings } from "./app-settings";

export type RunEventKind = "finished" | "failed" | "limit" | "awaiting";
export type RunEvent = { chatId: string | null; kind: RunEventKind; detail?: string };

export type Toast = { id: string; chatId: string | null; title: string; body: string; kind: RunEventKind };

const KIND_TEXT: Record<RunEventKind, string> = {
  finished: "Finished",
  failed: "Failed",
  limit: "Hit a usage limit",
  awaiting: "Needs your input",
};

// Context from the app, kept fresh by RunNotifications.
let viewedChatId: string | null = null;
let chatTitles: Record<string, string> = {};
export function setNotifyContext(viewed: string | null, titles: Record<string, string>) {
  viewedChatId = viewed;
  chatTitles = titles;
}

// A failure also ends the run; skip the "finished" that follows it.
const recentFailure = new Map<string, number>();

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
function setToasts(next: Toast[]) {
  toasts = next;
  for (const listener of listeners) listener();
}
export function dismissToast(id: string) {
  setToasts(toasts.filter((t) => t.id !== id));
}
export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
  );
}

const focused = () => (typeof document !== "undefined" ? document.hasFocus() : true);

export function notifyRunEvent(event: RunEvent) {
  const { chatId, kind } = event;
  if (chatId && (kind === "failed" || kind === "limit")) recentFailure.set(chatId, Date.now());
  if (chatId && kind === "finished") {
    const failedAt = recentFailure.get(chatId);
    if (failedAt && Date.now() - failedAt < 5_000) return;
  }
  // Stopped by you: not news.
  if (kind === "failed" && /abort/i.test(event.detail ?? "")) return;

  const settings = getSettings();
  const title = (chatId && chatTitles[chatId]) || "Kode";
  const body = event.detail ? `${KIND_TEXT[kind]}: ${event.detail}` : KIND_TEXT[kind];
  const isFocused = focused();

  const system =
    settings.threadNotifications === "always" ||
    (settings.threadNotifications === "background" && !isFocused);
  if (system) void invoke("notify_send", { title, body }).catch(() => {});
  // Sound plays for every thread event, even with alerts off.
  if (settings.notificationSound) playSound(settings.notificationSoundName);

  // In-app: only while the app has focus, and not for the chat on screen.
  if (settings.inAppNotifications && isFocused && chatId !== viewedChatId) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts([...toasts.slice(-3), { id, chatId, title, body, kind }]);
    window.setTimeout(() => dismissToast(id), 6_000);
  }
}

export const NOTIFICATION_SOUNDS = ["Glass", "Ping", "Pop", "Hero", "Purr", "Tink", "Blow", "Bottle", "Frog", "Funk", "Morse", "Submarine", "Sosumi", "Basso"];

export function playSound(name: string) {
  void invoke("play_sound", { name }).catch(() => {});
}
