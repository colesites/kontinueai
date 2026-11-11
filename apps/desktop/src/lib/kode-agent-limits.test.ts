import { describe, expect, test } from "bun:test";
import { CONTINUE_CUT_OFF, stepLimitPrompt } from "./kode-agent";
import { stripKodeArtifacts } from "./kode-sanitize";
import type { KodeTodo } from "./kode-tools";

describe("stepLimitPrompt", () => {
  test("names the steps still open and asks for a continue hint", () => {
    const todos: KodeTodo[] = [
      { title: "Inspect", status: "completed" },
      { title: "Add the store", status: "in_progress" },
      { title: "Drop it", status: "cancelled" },
      { title: "Test", status: "pending" },
    ];
    const prompt = stepLimitPrompt(todos);
    expect(prompt).toContain('Still open: "Add the store", "Test".');
    expect(prompt).not.toContain("Inspect");
    expect(prompt).toContain("continue");
  });

  test("works without a plan", () => {
    expect(stepLimitPrompt([])).not.toContain("Still open");
  });
});

describe("cut-off replies", () => {
  test("the continue prompt explains that the tool call did not run", () => {
    expect(CONTINUE_CUT_OFF).toContain("did not run");
  });

  test("DeepSeek markup never reaches the chat", () => {
    expect(stripKodeArtifacts("Now the store.\n<｜DSML｜function_calls>\n<｜DSML｜invoke name=\"write_file\">")).toBe("Now the store.");
    expect(stripKodeArtifacts("Done < | DSML | calls>")).toBe("Done");
    expect(stripKodeArtifacts("a < b is fine")).toBe("a < b is fine");
  });
});

import { stripLeftoverToolMarkup } from "./kode-sanitize";

describe("stripLeftoverToolMarkup", () => {
  test("removes markup lines from old saved replies and keeps the prose", () => {
    const saved = "Implementing all five.\n\n<｜DSML｜function_calls>\n\n</｜DSML｜function_calls>\n\nDone with step one.";
    expect(stripLeftoverToolMarkup(saved)).toBe("Implementing all five.\n\nDone with step one.");
    expect(stripLeftoverToolMarkup("< | DSML |  calls>")).toBe("");
  });

  test("leaves normal text alone", () => {
    const text = "Use `a < b` here.\n\n\n\nKeep spacing.";
    expect(stripLeftoverToolMarkup(text)).toBe(text);
  });
});
