import { describe, expect, test } from "bun:test";
import { condenseSteps, parseSteps, stepsBlock, withSteps } from "./kode-steps";
import { splitRichBlocks } from "./kode-rich-blocks";

const steps = [
  { id: "1", name: "update_todos", args: {}, description: "Updated plan", state: "done" },
  { id: "2", name: "read_file", args: { path: "src/a.ts" }, description: "Read src/a.ts", state: "done", result: "x".repeat(2000) },
  { id: "3", name: "ask_options", args: { question: "Which ids?" }, description: "Which ids?", state: "done", result: "User selected: Monotonic" },
  { id: "4", name: "run_command", args: { command: "bun test" }, description: "bun test", state: "running" },
] as never;

describe("saved steps", () => {
  test("saves the turn's steps without the plan, capped, and reads them back", () => {
    const block = stepsBlock(steps);
    const parsed = parseSteps(block.split("\n")[1])!;
    expect(parsed.map((s) => s.name)).toEqual(["read_file", "ask_options", "run_command"]);
    expect(parsed[0].result!.length).toBeLessThan(700);
    expect(parsed[2].state).toBe("error"); // still running when the turn ended
    expect(stepsBlock([] as never)).toBe("");
  });

  test("the message shows a steps block, the model gets one line per step", () => {
    const content = withSteps("Fixed it.", steps);
    expect(splitRichBlocks(content).map((s) => s.type)).toEqual(["steps", "markdown"]);
    const condensed = condenseSteps(content);
    expect(condensed).toContain("- Which ids? (done) → User selected: Monotonic");
    expect(condensed).toContain("- bun test (failed / no result)");
    expect(condensed).toContain("Fixed it.");
    expect(condensed).not.toContain("kode-steps");
    expect(condenseSteps("plain")).toBe("plain");
  });
});
