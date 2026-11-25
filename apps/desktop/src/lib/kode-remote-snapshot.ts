// A chat's run as remote control sees it (kode-remote-host.tsx): what is
// waiting on you, the reply so far and its recent tool steps. Pure, so the
// shapes stay in step with the in-app prompts (KodeComposerPrompt.tsx).

import type {
  KodeRemoteOption,
  KodeRemotePending,
  KodeRemoteQuestion,
  KodeRemoteRunStatus,
  KodeRemoteStep,
} from "@repo/core/kode-remote";
import type { ChatMessage } from "@/components/view/plan/messages";
import type { KodeToolStep } from "./kode-agent";

const MAX_STEPS = 30;

function asOptions(raw: unknown): KodeRemoteOption[] {
  if (!Array.isArray(raw)) return [];
  const items: KodeRemoteOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : typeof record.value === "string" ? record.value : "";
    if (!label) continue;
    items.push({
      value: typeof record.value === "string" ? record.value : label,
      label,
      ...(typeof record.description === "string" ? { description: record.description } : {}),
    });
  }
  return items;
}

function question(record: Record<string, unknown>, fallback: string): KodeRemoteQuestion {
  const options = asOptions(record.options);
  const rawKind = typeof record.kind === "string" ? record.kind : "";
  const kind = Boolean(record.multiple) || rawKind === "multi"
    ? "multi"
    : rawKind === "confirm"
      ? "confirm"
      : rawKind === "text" || options.length === 0
        ? "text"
        : "choice";
  return {
    question: typeof record.question === "string" && record.question.trim() ? record.question : fallback,
    kind,
    options,
    ...(record.allowOther ? { allowOther: true } : {}),
    ...(typeof record.placeholder === "string" ? { placeholder: record.placeholder } : {}),
  };
}

/** The approval card's title (KodeComposerPrompt ApprovalPrompt). */
export function approvalTitle(step: KodeToolStep): string {
  const command = typeof step.args.command === "string" ? step.args.command.trim() : "";
  const path = typeof step.args.path === "string" ? step.args.path : "";
  const fileName = path.split(/[\\/]/).pop() || path;
  if (command) return "Kode wants to run a command";
  if (step.name === "edit_file") return `Kode wants to edit ${fileName}`;
  if (step.name === "write_file") return `Kode wants to create ${fileName}`;
  return "Kode wants to take an action";
}

export function remotePending(step: KodeToolStep): KodeRemotePending | null {
  if (step.state === "pending-approval") {
    const command = typeof step.args.command === "string" ? step.args.command.trim() : "";
    const path = typeof step.args.path === "string" ? step.args.path : "";
    return {
      id: step.id,
      kind: "approval",
      title: approvalTitle(step),
      detail: (command || path || step.description).slice(0, 2_000),
    };
  }
  if (step.state === "pending-options") {
    const args = step.args as Record<string, unknown>;
    const form = Array.isArray(args.questions)
      ? args.questions
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && typeof (item as Record<string, unknown>).question === "string")
          .map((item) => question(item, step.description))
      : [];
    const questions = form.length > 1 ? form : [question(args, step.description)];
    return {
      id: step.id,
      kind: "question",
      title: questions[0]?.question ?? step.description,
      questions,
    };
  }
  return null;
}

export type RemoteRunView = {
  status: KodeRemoteRunStatus;
  text: string;
  steps: KodeRemoteStep[];
  pending: KodeRemotePending[];
  modelId?: string;
};

/** The chat's run right now, from the in-flight turn and its pending steps. */
export function remoteRunView(
  items: ChatMessage[] | undefined,
  running: boolean,
  pendingSteps: KodeToolStep[] | undefined,
): RemoteRunView {
  const pending = (pendingSteps ?? []).map(remotePending).filter((item): item is KodeRemotePending => item !== null);
  const status: KodeRemoteRunStatus = pending.length > 0 ? "awaiting" : running ? "running" : "idle";
  if (status === "idle") return { status, text: "", steps: [], pending: [] };
  const reply = [...(items ?? [])].reverse().find((item) => item.role === "assistant" && !item.notice);
  const steps = (reply?.toolSteps ?? [])
    .filter((step) => step.name !== "update_todos")
    .slice(-MAX_STEPS)
    .map((step) => ({ id: step.id, name: step.name, label: (step.description || step.name).slice(0, 300), state: step.state }));
  return { status, text: reply?.content ?? "", steps, pending, modelId: reply?.modelId };
}

/** What changed enough to publish now (anything but the streaming text). */
export function runSignature(view: RemoteRunView): string {
  return JSON.stringify([view.status, view.pending.map((item) => item.id), view.steps.map((step) => `${step.id}:${step.state}`)]);
}
