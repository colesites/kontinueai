import { expect, test } from "bun:test";
import { fanOutBranch, resolveSubagentModels } from "./kode-fanout";

test("branch names are short, safe and unique per model", () => {
  expect(fanOutBranch("Fix the login bug on Safari!", "Claude Opus 4.6", "k3f90")).toBe(
    "kode/fix-the-login-bug-on-saf-claude-opus-4-6-k3f90",
  );
  expect(fanOutBranch("???", "", "a1")).toBe("kode/task-model-a1");
});

test("matches requested model names to available models", () => {
  const available = [
    { id: "kode/k-ai", name: "K-AI 1.0" },
    { id: "cli:claude:opus", name: "Claude Opus 4.6" },
    { id: "cli:codex:gpt-5.5", name: "GPT-5.5 (Codex)" },
  ];
  expect(resolveSubagentModels(["claude opus", "codex", "cli:claude:opus", "llama"], available)).toEqual({
    ids: ["cli:claude:opus", "cli:codex:gpt-5.5"],
    unknown: ["llama"],
  });
});
