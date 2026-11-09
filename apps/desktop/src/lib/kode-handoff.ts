// Hand-off text for an agent that joins a chat midway: you switched models, or
// a CLI started a fresh session in a chat that already has turns. It gets the
// original task, the most recent turns in full, the plan and what has changed
// in the project, instead of a blind tail of the transcript.

import type { KodeTodo } from "./kode-tools";

export type HandoffMessage = {
  role: "user" | "assistant";
  content: string;
  /** Display name of the model that wrote an assistant message. */
  modelName?: string | null;
};

export type HandoffFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
};

export type HandoffInput = {
  history: HandoffMessage[];
  /** Model that answered last, when it differs from the one taking over. */
  fromModel?: string | null;
  todos?: KodeTodo[];
  branch?: string | null;
  changedFiles?: HandoffFile[];
  /** Extra context that must survive (an imported session's summary). */
  importContext?: string | null;
  /** Rough character budget for the whole hand-off. */
  budget?: number;
  /** What the last, unfinished turn's tool calls did (kode-tool-ledger). */
  interrupted?: string | null;
  /** Replaces the opening line (e.g. for context shared from another chat). */
  intro?: string;
};

export type Handoff = {
  text: string;
  /** Messages included in full or trimmed. */
  includedMessages: number;
  omittedMessages: number;
  files: number;
};

const DEFAULT_BUDGET = 28_000;
const TASK_CAP = 3_000;
const MESSAGE_CAP = 6_000;
const MAX_FILES = 40;

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return `${trimmed.slice(0, head)}\n[…${trimmed.length - max} characters cut…]\n${trimmed.slice(-tail)}`;
}

function speaker(message: HandoffMessage): string {
  if (message.role === "user") return "User";
  return message.modelName ? `Assistant (${message.modelName})` : "Assistant";
}

const TODO_MARK: Record<string, string> = {
  completed: "[x]",
  in_progress: "[~]",
  pending: "[ ]",
};

export function buildHandoff(input: HandoffInput): Handoff {
  const budget = input.budget ?? DEFAULT_BUDGET;
  const history = input.history.filter((m) => m.content.trim());
  const sections: string[] = [];

  sections.push(
    input.intro ??
    (input.fromModel
      ? `You are taking over this conversation from another assistant (${input.fromModel}). Continue from where it left off. Don't redo work that is already done, and check the project files before assuming anything changed.`
      : "You are joining this conversation partway through. Continue from where it left off and don't redo work that is already done."),
  );
  if (input.importContext?.trim()) sections.push(input.importContext.trim());

  // Plan and project state are small and high-signal, so they go in first.
  const tail: string[] = [];
  if (input.interrupted?.trim()) tail.push(input.interrupted.trim());
  if (input.todos?.length) {
    tail.push(
      [
        "## Plan at hand-off",
        ...input.todos.map((t) => `- ${TODO_MARK[t.status] ?? "[ ]"} ${t.title}`),
      ].join("\n"),
    );
  }
  const files = input.changedFiles ?? [];
  if (input.branch || files.length) {
    const lines = ["## Project state"];
    if (input.branch) lines.push(`Branch: ${input.branch}`);
    if (files.length) {
      lines.push(`Uncommitted changes (${files.length} file${files.length === 1 ? "" : "s"}):`);
      for (const file of files.slice(0, MAX_FILES)) {
        lines.push(`- ${file.status} ${file.path} (+${file.additions} -${file.deletions})`);
      }
      if (files.length > MAX_FILES) lines.push(`- …and ${files.length - MAX_FILES} more`);
    }
    tail.push(lines.join("\n"));
  }

  let remaining = budget - sections.join("\n\n").length - tail.join("\n\n").length;

  // The first user message is the task; keep it even when the middle goes.
  const firstUser = history.findIndex((m) => m.role === "user");
  const task = firstUser >= 0 ? clip(history[firstUser].content, TASK_CAP) : null;
  if (task) remaining -= task.length + 40;

  // Then the most recent turns, newest first, until the budget runs out.
  const recent: string[] = [];
  let included = 0;
  for (let i = history.length - 1; i > firstUser; i--) {
    const block = `${speaker(history[i])}: ${clip(history[i].content, MESSAGE_CAP)}`;
    if (block.length > remaining) {
      if (recent.length === 0 && remaining > 600) {
        recent.unshift(`${speaker(history[i])}: ${clip(history[i].content, remaining - 40)}`);
        included++;
      }
      break;
    }
    recent.unshift(block);
    remaining -= block.length + 2;
    included++;
  }
  const afterTask = history.length - (firstUser + 1);
  const omitted = Math.max(0, afterTask - included);

  if (task) {
    sections.push(`## Original request\n${task}`);
    included++;
  }
  if (recent.length) {
    sections.push(
      [
        "## Conversation so far (most recent last)",
        omitted > 0 ? `[${omitted} earlier message${omitted === 1 ? "" : "s"} left out]` : null,
        recent.join("\n\n"),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  sections.push(...tail);

  return {
    text: sections.join("\n\n"),
    includedMessages: included,
    omittedMessages: omitted,
    files: files.length,
  };
}

/** One line for the chat: what the new model was given. */
export function describeHandoff(handoff: Handoff, fromModel: string | null): string {
  const parts = [`${handoff.includedMessages} earlier message${handoff.includedMessages === 1 ? "" : "s"}`];
  if (handoff.files) parts.push(`${handoff.files} changed file${handoff.files === 1 ? "" : "s"}`);
  return fromModel
    ? `Picked up from ${fromModel} with ${parts.join(" and ")}.`
    : `Picked up the chat with ${parts.join(" and ")}.`;
}
