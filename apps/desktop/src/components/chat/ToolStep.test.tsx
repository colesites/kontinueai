import { describe, expect, test } from "bun:test";
import type { KodeToolStep } from "@/lib/kode-agent";
import { withSubagents } from "./ToolStep";

const step = (id: string, description: string, state: KodeToolStep["state"] = "done"): KodeToolStep => ({
  id,
  name: "acp",
  args: {},
  description,
  state,
});

describe("withSubagents", () => {
  test("gathers OpenCode sub-agent steps into one group where they started", () => {
    const entries = withSubagents([
      step("call_1", "read"),
      step("call_2", "subagent"),
      step("ses_aaa:call_3", "Review app (Kimi K3.1): read"),
      step("ses_bbb:call_4", "Review app (Gemini 4): glob", "running"),
      step("ses_aaa:call_5", "Review app (Kimi K3.1): grep"),
      step("call_6", "read"),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(["step", "subagents", "step"]);
    const group = entries[1];
    if (group.kind !== "subagents") throw new Error("expected a group");
    expect(group.items.map((i) => [i.label, i.status, i.detail])).toEqual([
      ["Review app (Kimi K3.1)", "done", "2 steps"],
      ["Review app (Gemini 4)", "working", "1 step"],
    ]);
  });

  test("a Claude Code Task step labels its sub-agent", () => {
    const entries = withSubagents([
      step("toolu_task", "Task: audit the panel", "running"),
      step("toolu_task:toolu_r1", "Read a.ts"),
    ]);
    expect(entries).toHaveLength(1);
    const group = entries[0];
    if (group.kind !== "subagents") throw new Error("expected a group");
    expect(group.items[0].label).toBe("Task: audit the panel");
    expect(group.items[0].status).toBe("working");
  });

  test("ordinary ids with a colon are not sub-agents", () => {
    const entries = withSubagents([step("functions.read_file:0", "Read a.ts"), step("functions.read_file:1", "Read b.ts")]);
    expect(entries.every((e) => e.kind === "step")).toBe(true);
  });
});
