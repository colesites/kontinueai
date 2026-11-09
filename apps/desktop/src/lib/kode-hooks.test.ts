import { expect, test } from "bun:test";
import { claudeToolName, hookMatches, readHookOutput } from "./kode-hooks";

test("matchers follow Claude Code rules", () => {
  expect(hookMatches(undefined, "Bash")).toBe(true);
  expect(hookMatches("*", "Edit")).toBe(true);
  expect(hookMatches("Edit|Write", claudeToolName("write_file"))).toBe(true);
  expect(hookMatches("Edit|Write", claudeToolName("run_command"))).toBe(false);
  expect(hookMatches("startup|resume", "startup")).toBe(true);
});

test("hook output: block, deny, context", () => {
  expect(readHookOutput("PreToolUse", "p", { exitCode: 2, stdout: "", stderr: "no rm -rf" })).toEqual({
    blocked: "no rm -rf",
    context: [],
  });
  expect(
    readHookOutput("PreToolUse", "p", {
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "nope" } }),
    }).blocked,
  ).toBe("nope");
  expect(readHookOutput("SessionStart", "p", { exitCode: 0, stdout: "Use bun.", stderr: "" }).context).toEqual(["Use bun."]);
  expect(readHookOutput("PostToolUse", "p", { exitCode: 0, stdout: "noise", stderr: "" }).context).toEqual([]);
  expect(readHookOutput("Stop", "p", { exitCode: 1, stdout: "", stderr: "crash" })).toEqual({ blocked: null, context: [] });
});
