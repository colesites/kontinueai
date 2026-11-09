import { describe, expect, test } from "bun:test";
import { buildHandoff, describeHandoff } from "./kode-handoff";

describe("buildHandoff", () => {
  test("includes task, recent turns, plan and project state", () => {
    const handoff = buildHandoff({
      fromModel: "Claude Opus",
      history: [
        { role: "user", content: "Add dark mode to settings" },
        { role: "assistant", content: "Added a toggle.", modelName: "Claude Opus" },
        { role: "user", content: "Now persist it" },
      ],
      todos: [
        { title: "Add toggle", status: "completed" },
        { title: "Persist setting", status: "in_progress" },
      ],
      branch: "feat/dark",
      changedFiles: [{ path: "src/settings.ts", status: "M", additions: 12, deletions: 3 }],
    });
    expect(handoff.text).toContain("taking over this conversation from another assistant (Claude Opus)");
    expect(handoff.text).toContain("## Original request\nAdd dark mode to settings");
    expect(handoff.text).toContain("Assistant (Claude Opus): Added a toggle.");
    expect(handoff.text).toContain("- [x] Add toggle");
    expect(handoff.text).toContain("- [~] Persist setting");
    expect(handoff.text).toContain("Branch: feat/dark");
    expect(handoff.text).toContain("- M src/settings.ts (+12 -3)");
    expect(handoff.omittedMessages).toBe(0);
    expect(handoff.includedMessages).toBe(3);
    expect(describeHandoff(handoff, "Claude Opus")).toBe(
      "Picked up from Claude Opus with 3 earlier messages and 1 changed file.",
    );
  });

  test("keeps the task and newest turns when the budget is tight", () => {
    const history = [
      { role: "user" as const, content: "THE TASK" },
      ...Array.from({ length: 30 }, (_, i) => ({
        role: (i % 2 ? "user" : "assistant") as "user" | "assistant",
        content: `message ${i} ${"x".repeat(500)}`,
      })),
    ];
    const handoff = buildHandoff({ history, budget: 4_000 });
    expect(handoff.text).toContain("THE TASK");
    expect(handoff.text).toContain("message 29");
    expect(handoff.text).not.toContain("message 0 ");
    expect(handoff.omittedMessages).toBeGreaterThan(0);
    expect(handoff.text).toContain("earlier messages left out");
    expect(handoff.text.length).toBeLessThan(4_500);
  });
});
