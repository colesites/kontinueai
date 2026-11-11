import { describe, expect, test } from "bun:test";
import type { KontinueTask } from "./convex-api";
import { dueReminders, REMINDER_GRACE_MS } from "./task-reminders";

const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
const MIN = 60_000;

function task(patch: Partial<KontinueTask>): KontinueTask {
  return { _id: "t1", title: "Task", priority: "medium", status: "todo", recurring: false, createdAt: NOW, updatedAt: NOW, ...patch };
}

describe("dueReminders", () => {
  test("fires a reminder whose time has just passed", () => {
    const t = task({ dueDate: NOW + 10 * MIN, reminderMinutesBefore: 15 });
    const { due, nextAt } = dueReminders([t], NOW, {});
    expect(due.map((d) => d.task._id)).toEqual(["t1"]);
    expect(nextAt).toBeNull();
  });

  test("waits for a reminder that is still ahead and reports when", () => {
    const t = task({ dueDate: NOW + 60 * MIN, reminderMinutesBefore: 15 });
    const { due, nextAt } = dueReminders([t], NOW, {});
    expect(due).toEqual([]);
    expect(nextAt).toBe(NOW + 45 * MIN);
  });

  test("does not repeat a reminder already sent", () => {
    const t = task({ dueDate: NOW - MIN });
    const first = dueReminders([t], NOW, {});
    expect(first.due).toHaveLength(1);
    expect(dueReminders([t], NOW, { [first.due[0].key]: NOW }).due).toEqual([]);
  });

  test("a rescheduled task reminds again", () => {
    const before = task({ dueDate: NOW - 5 * MIN });
    const sentKey = dueReminders([before], NOW, {}).due[0].key;
    const moved = task({ dueDate: NOW - MIN });
    expect(dueReminders([moved], NOW, { [sentKey]: NOW }).due).toHaveLength(1);
  });

  test("skips reminders older than the grace window", () => {
    const t = task({ dueDate: NOW - REMINDER_GRACE_MS - MIN });
    expect(dueReminders([t], NOW, {}).due).toEqual([]);
  });

  test("skips done tasks and tasks K-AI runs", () => {
    const done = task({ _id: "a", status: "done", dueDate: NOW - MIN });
    const agent = task({ _id: "b", isAgentTask: true, dueDate: NOW - MIN });
    expect(dueReminders([done, agent], NOW, {}).due).toEqual([]);
  });

  test("picks the earliest upcoming reminder", () => {
    const later = task({ _id: "a", dueDate: NOW + 90 * MIN });
    const sooner = task({ _id: "b", dueDate: NOW + 30 * MIN });
    expect(dueReminders([later, sooner], NOW, {}).nextAt).toBe(NOW + 30 * MIN);
  });
});
