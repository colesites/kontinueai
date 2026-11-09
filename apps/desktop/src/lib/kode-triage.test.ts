import { expect, test } from "bun:test";
import { pickTriageModel, triagePrompt } from "./kode-triage";

test("triage prefers the current agent, then Claude Code, then Codex", () => {
  const models = [{ id: "kontinue/kode-1.0" }, { id: "cli:codex:gpt-6" }, { id: "cli:claude:opus" }];
  const kind = (id: string) => ({ codex: "codex", claude: "claude", gemini: "acp" })[id];
  expect(pickTriageModel("cli:codex:gpt-6", models, kind)).toBe("cli:codex:gpt-6");
  expect(pickTriageModel("kontinue/kode-1.0", models, kind)).toBe("cli:claude:opus");
  expect(pickTriageModel("kontinue/kode-1.0", [{ id: "cli:codex:gpt-6" }], kind)).toBe("cli:codex:gpt-6");
  expect(pickTriageModel("kontinue/kode-1.0", [{ id: "cli:gemini:x" }], kind)).toBeNull();
  const prompt = triagePrompt("bun install fails", "## Diagnostics\n- git: 2.44");
  expect(prompt).toContain("What's wrong: bun install fails");
  expect(prompt).toContain("## Diagnostics");
  expect(prompt).toContain("Ask before anything destructive");
});
