import { describe, expect, test } from "bun:test";
import { isTransientModelError, KODE_CLARIFY_PROMPT, modeChangeNote } from "./kode-agent";
import { trimToolResults } from "./kode-compact";
import { createDeltaBatcher } from "./kode-run-state";

describe("isTransientModelError", () => {
  test("retries network and provider hiccups", () => {
    for (const text of [
      "Kontinue stream interrupted: connection reset",
      "Kontinue request failed: error sending request",
      "The model provider returned an error. Try again.",
      "OpenRouter returned 503: overloaded",
    ]) {
      expect(isTransientModelError(new Error(text))).toBe(true);
    }
  });

  test("does not retry limits, sign-in or bad requests", () => {
    for (const text of [
      "You've reached your weekly usage limit.\n[[limit-reset:123]]",
      "Sign in to use Kode.\n[[auth-expired]]",
      "Unknown Kode model.",
      "Invalid request body.",
    ]) {
      expect(isTransientModelError(new Error(text))).toBe(false);
    }
  });
});

describe("modeChangeNote", () => {
  test("tells the model what the new mode allows", () => {
    expect(modeChangeNote("plan")).toContain("read-only");
    expect(modeChangeNote("full_access")).toContain("without asking");
    expect(modeChangeNote("supervised")).toContain("asks the user first");
  });

  test("the clarify prompt asks once, with ask_options, and not for small changes", () => {
    expect(KODE_CLARIFY_PROMPT).toContain("ask_options");
    expect(KODE_CLARIFY_PROMPT).toContain("small or clearly specified change");
  });
});

describe("trimToolResults", () => {
  const tool = (n: number) => ({ role: "tool", content: `result ${n} `.repeat(400) });

  test("leaves a turn inside its budget alone", () => {
    const messages = [{ role: "user", content: "hi" }, tool(1)];
    expect(trimToolResults(messages, 1_000_000)).toBe(0);
  });

  test("cuts the oldest tool output first and keeps the latest whole", () => {
    const messages = [{ role: "user", content: "build it" }, ...Array.from({ length: 20 }, (_, i) => tool(i))];
    const budget = 20_000; // the turn is ~22k tokens
    const trimmed = trimToolResults(messages, budget);
    expect(trimmed).toBeGreaterThan(0);
    expect((messages[1].content as string).length).toBeLessThan(600);
    expect(messages[1].content).toContain("trimmed");
    // The latest eight tool results are untouched.
    for (const m of messages.slice(-8)) expect(m.content).not.toContain("trimmed");
    // Running it again doesn't trim twice.
    const again = messages.map((m) => m.content);
    trimToolResults(messages, budget);
    expect(messages.map((m) => m.content).filter((c, i) => c !== again[i]).every((c) => !String(c).includes("trimmed…"))).toBe(true);
  });
});

describe("createDeltaBatcher", () => {
  test("joins deltas per field and applies them once", async () => {
    const applied: [string, string][] = [];
    const batch = createDeltaBatcher<"content" | "reasoning">((key, text) => applied.push([key, text]), 10);
    batch.push("reasoning", "th");
    batch.push("content", "Hel");
    batch.push("content", "lo");
    batch.push("reasoning", "ink");
    expect(applied).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(applied).toEqual([
      ["reasoning", "think"],
      ["content", "Hello"],
    ]);
  });

  test("flush applies right away", () => {
    const applied: string[] = [];
    const batch = createDeltaBatcher<"content">((_, text) => applied.push(text), 1_000);
    batch.push("content", "now");
    batch.flush();
    expect(applied).toEqual(["now"]);
  });
});
