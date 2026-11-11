// Task reminders on this Mac (Tasks → bell). The server already emails and
// pushes reminders; this adds a macOS notification while Kontinue is running.
// Mounted once in ViewLayout so it works from any screen.

import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { getSettings, useAppSettings } from "@/lib/app-settings";
import { tasksApi } from "@/lib/convex-api";
import { playSound } from "@/lib/kode-notify";
import { formatTime, hasTime, reminderFireAt, type Task } from "@/lib/tasks";

const STORAGE_KEY = "kontinue.taskReminders.sent";
/** A reminder that came due while the app was closed still shows if it is
 *  this recent; older ones are skipped (same window the server uses). */
export const REMINDER_GRACE_MS = 60 * 60_000;
const MAX_TIMER_MS = 6 * 60 * 60_000;
const MAX_REMEMBERED = 400;

function loadSent(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function markSent(key: string, at: number) {
  const sent = loadSent();
  sent[key] = at;
  const entries = Object.entries(sent).sort((a, b) => b[1] - a[1]).slice(0, MAX_REMEMBERED);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage unavailable: worst case the reminder shows again next launch.
  }
}

/** Reminders that are due now, and when the next one after that is due. */
export function dueReminders(
  tasks: Task[],
  now: number,
  sent: Record<string, number>,
): { due: { task: Task; key: string }[]; nextAt: number | null } {
  const due: { task: Task; key: string }[] = [];
  let nextAt: number | null = null;
  for (const task of tasks) {
    // K-AI tasks run on the server and report back there.
    if (task.isAgentTask) continue;
    const fireAt = reminderFireAt(task);
    if (fireAt == null) continue;
    // Keyed by fire time, so a rescheduled or repeating task reminds again.
    const key = `${task._id}:${fireAt}`;
    if (sent[key]) continue;
    if (fireAt > now) {
      if (nextAt == null || fireAt < nextAt) nextAt = fireAt;
    } else if (now - fireAt <= REMINDER_GRACE_MS) {
      due.push({ task, key });
    }
  }
  return { due, nextAt };
}

function reminderBody(task: Task): string {
  if (task.dueDate == null) return task.description ?? "";
  const when = hasTime(task.dueDate) ? `Due ${formatTime(task.dueDate)}` : "Due today";
  return task.description ? `${when} · ${task.description}` : when;
}

export function useTaskReminders() {
  const { taskReminders } = useAppSettings();
  const tasks = useQuery(tasksApi.tasks.listTasks, taskReminders ? {} : "skip");

  useEffect(() => {
    if (!taskReminders || !tasks) return;
    let timer: number | undefined;

    const check = () => {
      const now = Date.now();
      const { due, nextAt } = dueReminders(tasks, now, loadSent());
      for (const { task, key } of due) {
        markSent(key, now);
        void invoke("notify_send", { title: task.title, body: reminderBody(task) }).catch(() => {});
      }
      if (due.length > 0) {
        const settings = getSettings();
        if (settings.notificationSound) playSound(settings.notificationSoundName);
      }
      // Re-check at the next reminder; long waits are capped so a sleeping
      // Mac that wakes late still catches up.
      const wait = nextAt == null ? MAX_TIMER_MS : Math.min(Math.max(nextAt - now, 1_000), MAX_TIMER_MS);
      timer = window.setTimeout(check, wait);
    };

    check();
    return () => window.clearTimeout(timer);
  }, [taskReminders, tasks]);
}
