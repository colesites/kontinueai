// What a turn's tool calls actually did when the turn didn't finish (usage
// limit, error, stop). The next turn, on any model, is told which actions
// completed, which failed and which have an unknown outcome (started, but no
// result came back: files may have changed), so it checks before re-running
// instead of blindly repeating them.
//
// Kept per chat in localStorage, cleared when a later turn finishes normally.

import type { KodeToolStep } from "./kode-agent";

export type ToolOutcome = "completed" | "failed" | "unknown" | "not_run";

export type LedgerStep = {
  name: string;
  description: string;
  outcome: ToolOutcome;
  result?: string;
};

export type InterruptedTurn = {
  at: number;
  model: string | null;
  reason: string;
  steps: LedgerStep[];
};

const KEY = "kode.interrupted-turns";
const RESULT_CAP = 600;

export function stepOutcome(step: Pick<KodeToolStep, "state">): ToolOutcome {
  switch (step.state) {
    case "done":
      return "completed";
    case "error":
      return "failed";
    case "running":
      return "unknown";
    default:
      // Waiting on approval / an answer, or rejected: it never ran.
      return "not_run";
  }
}

export function ledgerFromSteps(steps: KodeToolStep[]): LedgerStep[] {
  return steps.map((step) => ({
    name: step.name,
    description: step.description || step.name,
    outcome: stepOutcome(step),
    ...(step.result ? { result: step.result.slice(0, RESULT_CAP) } : {}),
  }));
}

function load(): Record<string, InterruptedTurn> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, InterruptedTurn>;
  } catch {
    return {};
  }
}

function save(store: Record<string, InterruptedTurn>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable: the note is just skipped.
  }
}

export function recordInterruptedTurn(chatId: string, turn: InterruptedTurn) {
  if (!turn.steps.some((s) => s.outcome !== "not_run")) return;
  save({ ...load(), [chatId]: turn });
}

export function getInterruptedTurn(chatId: string | null): InterruptedTurn | null {
  return chatId ? (load()[chatId] ?? null) : null;
}

export function clearInterruptedTurn(chatId: string) {
  const store = load();
  if (!(chatId in store)) return;
  delete store[chatId];
  save(store);
}

/** The note the next turn gets (also part of a model hand-off). */
export function interruptedTurnNote(turn: InterruptedTurn): string {
  const group = (outcome: ToolOutcome) => turn.steps.filter((s) => s.outcome === outcome);
  const line = (s: LedgerStep) => `- ${s.name}: ${s.description}${s.result ? `\n  Result: ${s.result.replace(/\s+/g, " ").trim()}` : ""}`;
  const lines = [
    "## The previous turn did not finish",
    `It stopped (${turn.reason})${turn.model ? ` while ${turn.model} was working` : ""}. Its last message may describe work as about to happen that already happened, or never did. Here is what its tool calls actually did:`,
  ];
  const sections: [ToolOutcome, string][] = [
    ["completed", "Completed (don't repeat these):"],
    ["failed", "Failed:"],
    ["unknown", "Outcome unknown (started, no result came back; it may have changed files or still be running):"],
  ];
  for (const [outcome, title] of sections) {
    const items = group(outcome);
    if (items.length) lines.push("", title, ...items.map(line));
  }
  if (group("unknown").length) {
    lines.push(
      "",
      "Before re-running anything with an unknown outcome, check its effects (git status and diffs, generated files, running processes). Only re-run it if it clearly didn't happen.",
    );
  }
  return lines.join("\n");
}
