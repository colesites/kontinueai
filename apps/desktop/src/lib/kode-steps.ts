// A finished turn's tool steps, saved inside the assistant message as a
// ```kode-steps block so they stay visible after the turn (and on other
// devices), and the next model, including after a model switch, sees what
// actually ran and what you answered.

import type { KodeToolStep } from "./kode-agent";

export const STEPS_FENCE = "kode-steps";
const ARG_CAP = 1_500;
const RESULT_CAP = 600;
const TOTAL_CAP = 16_000;
// The plan has its own dock; these add nothing to the step list.
const SKIP = new Set(["update_todos"]);

type SavedStep = Pick<KodeToolStep, "id" | "name" | "description" | "state"> & {
  args?: Record<string, unknown>;
  result?: string;
};

function capArgs(args: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!args) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") out[key] = value.length > ARG_CAP ? `${value.slice(0, ARG_CAP)}…` : value;
    else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
    else if (value !== null && value !== undefined) {
      const json = JSON.stringify(value);
      if (json.length <= ARG_CAP) out[key] = value;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** The block to save with the message ("" when there's nothing worth saving). */
export function stepsBlock(steps: KodeToolStep[]): string {
  let saved: SavedStep[] = steps
    .filter((step) => !SKIP.has(step.name))
    .map((step) => ({
      id: step.id,
      name: step.name,
      description: step.description,
      // A step still running when the turn ended never reported back.
      state: step.state === "running" ? "error" : step.state,
      args: capArgs(step.args as Record<string, unknown>),
      ...(step.result ? { result: step.result.length > RESULT_CAP ? `${step.result.slice(0, RESULT_CAP)}…` : step.result } : {}),
    }));
  if (saved.length === 0) return "";
  let json = JSON.stringify(saved);
  // Too big: drop details from the oldest steps first, keep the newest.
  for (let index = 0; json.length > TOTAL_CAP && index < saved.length; index += 1) {
    saved = saved.map((step, i) => (i === index ? { ...step, args: undefined, result: undefined } : step));
    json = JSON.stringify(saved);
  }
  return `\`\`\`${STEPS_FENCE}\n${json}\n\`\`\``;
}

/** Steps back from a saved block (with the fields ToolStepList needs). */
export function parseSteps(json: string): KodeToolStep[] | null {
  try {
    const data = JSON.parse(json) as SavedStep[];
    if (!Array.isArray(data)) return null;
    return data
      .filter((step) => typeof step?.name === "string")
      .map((step, index) => ({
        id: step.id || `saved-${index}`,
        name: step.name,
        description: step.description || step.name,
        state: step.state ?? "done",
        args: (step.args ?? {}) as KodeToolStep["args"],
        ...(step.result ? { result: step.result } : {}),
      }));
  } catch {
    return null;
  }
}

/** Message content with the turn's steps in front (they ran before the reply). */
export function withSteps(content: string, steps: KodeToolStep[]): string {
  const block = stepsBlock(steps);
  return block ? `${block}\n\n${content}` : content;
}

const BLOCK = new RegExp("```" + STEPS_FENCE + "\\n([\\s\\S]*?)\\n```\\n*", "g");

/** For model history: each saved steps block as one short line per step. */
export function condenseSteps(content: string): string {
  if (!content.includes("```" + STEPS_FENCE)) return content;
  return content.replace(BLOCK, (_, json: string) => {
    const steps = parseSteps(json);
    if (!steps?.length) return "";
    const lines = steps.map((step) => {
      const outcome = step.state === "done" ? "done" : step.state === "rejected" ? "denied" : "failed / no result";
      const answer = step.name === "ask_options" && step.result ? ` → ${step.result.replace(/\s+/g, " ").slice(0, 200)}` : "";
      return `- ${step.description} (${outcome})${answer}`;
    });
    return `[What I did this turn:\n${lines.join("\n")}]\n\n`;
  }).trim();
}
