// Prompts queued to send later, mostly "send when my limit resets".
//
// Kept in localStorage so they survive a restart. The chat view (PlanView)
// sends due prompts for the open chat; for another chat it switches to it when
// you have been idle for a while, or shows a "ready" bar you can click.

import { useSyncExternalStore } from "react";
import type { StagedAttachment } from "@/components/chat/ChatInput";
import type { KodeAgentMode } from "./kode-tools";

export type ScheduledPrompt = {
  id: string;
  chatId: string;
  chatTitle: string | null;
  text: string;
  modelId: string;
  mode: KodeAgentMode;
  attachments?: StagedAttachment[];
  /** Epoch ms to send at. */
  fireAt: number;
  createdAt: number;
  /** Why it was queued: a limit hit, picked by hand, or a PR event (Auto-fix). */
  reason: "limit" | "manual" | "pr";
};

const STORAGE_KEY = "kode.scheduled-prompts";
/** Attachments bigger than this aren't kept (localStorage is small). */
const MAX_ATTACHMENT_CHARS = 1_500_000;
/** Send a little after the reset so the provider has rolled over. */
export const RESET_BUFFER_MS = 60_000;

const EMPTY: ScheduledPrompt[] = [];
let items: ScheduledPrompt[] = load();
const listeners = new Set<() => void>();

function load(): ScheduledPrompt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ScheduledPrompt[]) : [];
    return Array.isArray(parsed) && parsed.length ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

function commit(next: ScheduledPrompt[]) {
  items = next.length ? [...next].sort((a, b) => a.fireAt - b.fireAt) : EMPTY;
  try {
    if (items.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage full or blocked: keep the queue in memory for this session.
  }
  for (const listener of listeners) listener();
}

export function useScheduledPrompts(): ScheduledPrompt[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
  );
}

export function getScheduledPrompts(): ScheduledPrompt[] {
  return items;
}

/** Queue a prompt. Returns false when attachments had to be dropped. */
export function schedulePrompt(
  input: Omit<ScheduledPrompt, "id" | "createdAt">,
): { id: string; droppedAttachments: boolean } {
  const size = JSON.stringify(input.attachments ?? []).length;
  const keep = size <= MAX_ATTACHMENT_CHARS;
  const id = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  commit([
    ...items,
    {
      ...input,
      attachments: keep && input.attachments?.length ? input.attachments : undefined,
      id,
      createdAt: Date.now(),
    },
  ]);
  return { id, droppedAttachments: !keep };
}

export function reschedulePrompt(id: string, fireAt: number) {
  commit(items.map((item) => (item.id === id ? { ...item, fireAt } : item)));
}

export function removeScheduledPrompt(id: string) {
  if (items.some((item) => item.id === id)) commit(items.filter((item) => item.id !== id));
}

// Last keyboard / pointer activity, for "has the user stepped away?".
let lastActivity = Date.now();
if (typeof window !== "undefined") {
  const mark = () => {
    lastActivity = Date.now();
  };
  for (const type of ["keydown", "pointerdown", "wheel"]) {
    window.addEventListener(type, mark, { passive: true, capture: true });
  }
}

/** Milliseconds since the user last typed, clicked or scrolled. */
export function idleFor(now = Date.now()): number {
  return now - lastActivity;
}
