import { describe, expect, test } from "bun:test";
import type { KodeTodo } from "./kode-tools";
import { interruptedReply } from "./kode-turn-notes";

const todo = (title: string, status: KodeTodo["status"]): KodeTodo => ({ id: title, title, status }) as KodeTodo;

describe("interruptedReply", () => {
  test("keeps what was written and says why and where it stopped", () => {
    const out = interruptedReply("Read the files.", "stream interrupted", [
      todo("Inspect", "completed"),
      todo("Add the store", "in_progress"),
      todo("Wire it up", "pending"),
      todo("Test", "pending"),
    ]);
    expect(out.startsWith("Read the files.\n\n> **This turn stopped before finishing.**")).toBe(true);
    expect(out).toContain("stream interrupted");
    expect(out).toContain('working on "Add the store", with 2 more steps after it');
    expect(out).toContain("continue");
  });

  test("works with no text, no reason and no plan", () => {
    const out = interruptedReply("  ", "", []);
    expect(out).toContain("The model connection failed.");
    expect(out).not.toContain("working on");
  });

  test("falls back to the first open step when none is in progress", () => {
    expect(interruptedReply("", "x", [todo("Only step", "pending")])).toContain('working on "Only step".');
  });
});
