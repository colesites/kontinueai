import { describe, expect, test } from "bun:test";
import type { KontinueTask } from "./convex-api";
import {
  bucketFor,
  formatDue,
  groupByBucket,
  hasTime,
  isOverdue,
  matchesQuery,
  reminderFireAt,
  reminderLabel,
  withDay,
} from "./tasks";

const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime(); // Tue 10 Nov 2026, noon
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).getTime();

function task(patch: Partial<KontinueTask>): KontinueTask {
  return {
    _id: "t1",
    title: "Task",
    priority: "medium",
    status: "todo",
    recurring: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

describe("bucketFor", () => {
  test("sorts open tasks by due day", () => {
    expect(bucketFor(task({ dueDate: at(2026, 10, 9, 23, 59) }), NOW)).toBe("overdue");
    expect(bucketFor(task({ dueDate: at(2026, 10, 10) }), NOW)).toBe("today");
    expect(bucketFor(task({ dueDate: at(2026, 10, 10, 23, 30) }), NOW)).toBe("today");
    expect(bucketFor(task({ dueDate: at(2026, 10, 11) }), NOW)).toBe("upcoming");
    expect(bucketFor(task({}), NOW)).toBe("someday");
  });

  test("a done task is completed whatever its date", () => {
    expect(bucketFor(task({ status: "done", dueDate: at(2026, 10, 1) }), NOW)).toBe("completed");
  });

  test("earlier today is due today, not overdue", () => {
    const earlier = task({ dueDate: at(2026, 10, 10, 8) });
    expect(bucketFor(earlier, NOW)).toBe("today");
    expect(isOverdue(earlier, NOW)).toBe(false);
  });
});

describe("groupByBucket", () => {
  test("orders each group by due date and puts completed last-finished first", () => {
    const groups = groupByBucket(
      [
        task({ _id: "b", dueDate: at(2026, 10, 14) }),
        task({ _id: "a", dueDate: at(2026, 10, 12) }),
        task({ _id: "d1", status: "done", completedAt: 1 }),
        task({ _id: "d2", status: "done", completedAt: 2 }),
      ],
      NOW,
    );
    expect(groups.upcoming.map((t) => t._id)).toEqual(["a", "b"]);
    expect(groups.completed.map((t) => t._id)).toEqual(["d2", "d1"]);
  });
});

describe("formatDue", () => {
  test("uses relative days near today", () => {
    expect(formatDue(at(2026, 10, 10), NOW)).toBe("Today");
    expect(formatDue(at(2026, 10, 11), NOW)).toBe("Tomorrow");
    expect(formatDue(at(2026, 10, 9), NOW)).toBe("Yesterday");
  });

  test("adds the time only when one is set", () => {
    expect(hasTime(at(2026, 10, 10))).toBe(false);
    expect(formatDue(at(2026, 10, 10, 15, 30), NOW)).toContain("Today, ");
  });

  test("shows the year for other years", () => {
    expect(formatDue(at(2025, 7, 1), NOW)).toContain("2025");
    expect(formatDue(at(2026, 7, 1), NOW)).not.toContain("2026");
  });
});

describe("withDay", () => {
  test("keeps the time of day when moving to another day", () => {
    const moved = new Date(withDay(at(2026, 10, 10, 15, 30), new Date(2026, 10, 20)));
    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([20, 15, 30]);
  });

  test("an undated task lands at midnight", () => {
    expect(hasTime(withDay(null, new Date(2026, 10, 20)))).toBe(false);
  });
});

describe("reminderFireAt", () => {
  test("fires the given minutes before the due time", () => {
    const due = at(2026, 10, 10, 15);
    expect(reminderFireAt(task({ dueDate: due, reminderMinutesBefore: 15 }))).toBe(due - 15 * 60_000);
  });

  test("a timed task with no reminder fires at the due time", () => {
    const due = at(2026, 10, 10, 15);
    expect(reminderFireAt(task({ dueDate: due }))).toBe(due);
  });

  test("date-only, undated and done tasks do not fire", () => {
    expect(reminderFireAt(task({ dueDate: at(2026, 10, 10) }))).toBeNull();
    expect(reminderFireAt(task({}))).toBeNull();
    expect(reminderFireAt(task({ status: "done", dueDate: at(2026, 10, 10, 15) }))).toBeNull();
  });
});

describe("labels and search", () => {
  test("reminderLabel covers presets and custom offsets", () => {
    expect(reminderLabel(null)).toBe("No reminder");
    expect(reminderLabel(0)).toBe("At due time");
    expect(reminderLabel(120)).toBe("2 hours before");
    expect(reminderLabel(2880)).toBe("2 days before");
    expect(reminderLabel(7)).toBe("7 minutes before");
  });

  test("matchesQuery searches title, description and K-AI instruction", () => {
    const t = task({ title: "Ship release", description: "notes for Friday", aiInstruction: "summarise inbox" });
    expect(matchesQuery(t, "  SHIP ")).toBe(true);
    expect(matchesQuery(t, "friday")).toBe(true);
    expect(matchesQuery(t, "inbox")).toBe(true);
    expect(matchesQuery(t, "missing")).toBe(false);
  });
});
