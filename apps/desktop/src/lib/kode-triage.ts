// `/triage [what's wrong]`: collect diagnostics (src-tauri/src/triage.rs) and
// hand the broken install to Claude Code or Codex to investigate and fix.

import { invoke } from "@tauri-apps/api/core";
import { parseCliModelId } from "./kode-cli";

export async function triageReport(root: string | null): Promise<string> {
  return invoke<string>("kode_triage_report", { root });
}

/**
 * The model to triage with: the current one when it's Claude Code or Codex,
 * else the first Claude Code model, else the first Codex model.
 */
export function pickTriageModel(
  currentModelId: string,
  pickerModels: { id: string }[],
  kindOf: (instanceId: string) => string | undefined,
): string | null {
  const isAgent = (id: string) => {
    const parsed = parseCliModelId(id);
    const kind = parsed ? kindOf(parsed.instanceId) : undefined;
    return kind === "claude" || kind === "codex" ? kind : null;
  };
  if (isAgent(currentModelId) && pickerModels.some((m) => m.id === currentModelId)) return currentModelId;
  return (
    pickerModels.find((m) => isAgent(m.id) === "claude")?.id ??
    pickerModels.find((m) => isAgent(m.id) === "codex")?.id ??
    null
  );
}

export function triagePrompt(problem: string, report: string): string {
  return [
    "Something in this setup is broken. Find the cause and fix it.",
    "",
    `What's wrong: ${problem.trim() || "Not described. Check the tools and project below for anything missing, outdated or failing."}`,
    "",
    report.trim(),
    "",
    "How to work:",
    "- Reproduce the problem first (run the failing command), then fix the cause, not the symptom.",
    "- Prefer the project's own package manager and scripts.",
    "- Ask before anything destructive: deleting files, resetting git, uninstalling tools, or changing global config.",
    "- Never print secrets or environment variable values.",
    "- Finish with what was wrong, what you changed, and how to check it's fixed.",
  ].join("\n");
}
