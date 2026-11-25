// Multi-model sub-agents: one task sent to several models at once, each in
// its own git worktree (~/.kontinue/worktrees/<repo>/<branch>, see
// panel_git_worktree_add) and its own Kode chat. Started from a prompt: the
// Kode agent calls the `run_subagents` tool (buildSubagentTool) and gets every
// result back to compare. Runs are unattended: edits are accepted, and anything
// that would need your approval is declined.
//
// Any number of models can be asked; at most MAX_PARALLEL run at once (each is
// a full agent with its own worktree and process) and the rest wait queued.

import { useSyncExternalStore } from "react";
import { gitStatus } from "@/components/panel/panel-api";
import { runKodeAgent, type KodeExtraTool, type KodeToolStep } from "./kode-agent";
import { cliToolStep, getProvider, parseCliModelId, runCliTurn, saveCliSession } from "./kode-cli";
import { withSteps } from "./kode-steps";
import type { KodeAgentMode, KodeTodo } from "./kode-tools";
import { addWorktree, branchPrefix, slugify } from "./kode-branches";
import { linkSubagentChat } from "./kode-subagent-links";

export type FanOutRunStatus = "queued" | "starting" | "running" | "done" | "error" | "stopped";

export type FanOutRun = {
  id: string;
  modelId: string;
  modelName: string;
  /** Logo key for the model's provider (ModelSelectorLogo). */
  provider: string | null;
  status: FanOutRunStatus;
  chatId: string | null;
  worktree: string | null;
  branch: string;
  /** Last bit of the reply, for status. */
  preview: string;
  /** End of the final reply, for the calling agent to compare. */
  reply: string;
  /** What it's doing: its tool steps, shown when its row is expanded. */
  steps: KodeToolStep[];
  error: string | null;
  files: number | null;
  additions: number;
  deletions: number;
  startedAt: number;
  finishedAt: number | null;
};

export type FanOut = {
  id: string;
  /** The chat whose agent started these sub-agents. */
  parentChatId: string | null;
  prompt: string;
  mode: KodeAgentMode;
  createdAt: number;
  runs: FanOutRun[];
};

export type FanOutDeps = {
  ensureFolder: (path: string) => string;
  createChatRecord: (input: { title: string; projectId?: string | null }) => Promise<string>;
  addMessageRecord: (input: {
    chatId: string;
    role: "user" | "assistant";
    content: string;
    model?: string;
    todos?: KodeTodo[];
  }) => Promise<unknown>;
  modelName: (modelId: string) => string;
  /** Logo key for a model's provider, for the sub-agent rows. */
  modelProvider?: (modelId: string) => string | undefined;
};

// ---------------------------------------------------------------------------
// Run state (in memory: the chats are what persists)
// ---------------------------------------------------------------------------

const EMPTY: FanOut[] = [];
let fanOuts: FanOut[] = EMPTY;
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

function emit(next: FanOut[]) {
  fanOuts = next.length ? next : EMPTY;
  for (const listener of listeners) listener();
}

/** Every sub-agent group started this session, newest first. */
export function useFanOuts(): FanOut[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => fanOuts,
    () => fanOuts,
  );
}

/** Watch the groups outside React (the MCP bridge reports progress). */
export function subscribeFanOuts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFanOut(id: string): FanOut | undefined {
  return fanOuts.find((f) => f.id === id);
}

// Models that can run as sub-agents, published by the chat view (plan rules
// and the user's providers decide the list) for agents that ask over MCP.
export type PublishedModel = SubagentModel & { provider?: string };
let publishedModels: PublishedModel[] = [];
const modelListeners = new Set<() => void>();

export function publishSubagentModels(models: PublishedModel[]) {
  const same =
    models.length === publishedModels.length &&
    models.every((m, i) => m.id === publishedModels[i]?.id && m.name === publishedModels[i]?.name);
  if (same) return;
  publishedModels = models;
  for (const listener of modelListeners) listener();
}

export function getSubagentModels(): PublishedModel[] {
  return publishedModels;
}

export function useSubagentModels(): PublishedModel[] {
  return useSyncExternalStore(
    (listener) => {
      modelListeners.add(listener);
      return () => modelListeners.delete(listener);
    },
    () => publishedModels,
    () => publishedModels,
  );
}

/** Sub-agents running at once; more than this wait queued. */
export const MAX_PARALLEL = 6;
/** Sanity bound on one request, not a product limit. */
export const MAX_SUBAGENTS = 16;

function patchRun(fanOutId: string, runId: string, patch: Partial<FanOutRun>) {
  emit(
    fanOuts.map((f) =>
      f.id !== fanOutId ? f : { ...f, runs: f.runs.map((r) => (r.id === runId ? { ...r, ...patch } : r)) },
    ),
  );
}

export function stopFanOutRun(runId: string) {
  controllers.get(runId)?.abort();
  // Still queued: it never started, so just mark it.
  for (const fanOut of fanOuts) {
    const run = fanOut.runs.find((r) => r.id === runId);
    if (run?.status === "queued") patchRun(fanOut.id, runId, { status: "stopped", finishedAt: Date.now() });
  }
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

/** "kode/fix-login-claude-opus-k3f9" style branch names. */
export function fanOutBranch(prompt: string, modelName: string, suffix: string, prefix = branchPrefix()): string {
  return `${prefix}${slugify(prompt, 24) || "task"}-${slugify(modelName, 20) || "model"}-${suffix}`;
}

const REPLY_CHARS = 2_000;
/** Steps kept per run for its expanded row (the newest). */
const MAX_RUN_STEPS = 60;
const previewOf = (text: string) => text.replace(/\s+/g, " ").trim().slice(-160);

/** Start one sub-agent per model; `done` resolves with every run's outcome. */
export function startFanOut(input: {
  root: string;
  prompt: string;
  modelIds: string[];
  mode: KodeAgentMode;
  deps: FanOutDeps;
  parentChatId?: string | null;
  signal?: AbortSignal;
}): { id: string; done: Promise<FanOutRun[]> } {
  const { root, prompt, modelIds, mode, deps } = input;
  const suffix = Date.now().toString(36).slice(-4);
  const id = `fanout-${Date.now()}`;
  const runs: FanOutRun[] = modelIds.map((modelId, index) => {
    const modelName = deps.modelName(modelId);
    return {
      id: `${id}-${index}`,
      modelId,
      modelName,
      provider: deps.modelProvider?.(modelId) ?? null,
      status: "queued",
      chatId: null,
      worktree: null,
      branch: fanOutBranch(prompt, modelName, `${suffix}${index}`),
      preview: "",
      reply: "",
      steps: [],
      error: null,
      files: null,
      additions: 0,
      deletions: 0,
      startedAt: Date.now(),
      finishedAt: null,
    };
  });
  emit([{ id, parentChatId: input.parentChatId ?? null, prompt, mode, createdAt: Date.now(), runs }, ...fanOuts]);
  input.signal?.addEventListener("abort", () => runs.forEach((run) => stopFanOutRun(run.id)), {
    once: true,
  });
  // A small pool: MAX_PARALLEL workers take runs in order until none are left.
  let next = 0;
  const worker = async () => {
    while (next < runs.length) {
      const run = runs[next++];
      const current = fanOuts.find((f) => f.id === id)?.runs.find((r) => r.id === run.id);
      if (current?.status === "stopped" || input.signal?.aborted) continue;
      await runOne(id, run, root, prompt, mode, deps, input.parentChatId ?? null);
    }
  };
  const workers = Array.from({ length: Math.min(MAX_PARALLEL, runs.length) }, worker);
  const done = Promise.all(workers).then(() => fanOuts.find((f) => f.id === id)?.runs ?? runs);
  return { id, done };
}

async function runOne(
  fanOutId: string,
  run: FanOutRun,
  root: string,
  prompt: string,
  mode: KodeAgentMode,
  deps: FanOutDeps,
  parentChatId: string | null,
) {
  const controller = new AbortController();
  controllers.set(run.id, controller);
  patchRun(fanOutId, run.id, { status: "starting", startedAt: Date.now() });
  let text = "";
  let todos: KodeTodo[] = [];
  const steps: KodeToolStep[] = [];
  const declined: string[] = [];
  let persist: (reply: string) => Promise<void> = async () => {};
  try {
    // Runs that can edit get their own worktree so they can't trample each
    // other or the parent's checkout. Read-only ("plan") runs only look, so
    // they work in the project itself: no branch, no full checkout on disk.
    // Sub-agents branch from where their parent is, not the new-thread base.
    const readOnly = mode === "plan";
    const worktree = readOnly ? root : await addWorktree(root, run.branch, null);
    const projectId = deps.ensureFolder(worktree);
    patchRun(fanOutId, run.id, { worktree: readOnly ? null : worktree, status: "running" });

    // Its chat (so the work can be read and continued) is made once there is
    // something to put in it: runs that failed at once used to leave empty
    // "sub-agent" chats behind. Shown inside the parent chat, not the sidebar.
    let cliSession: { instanceId: string; sessionId: string } | null = null;
    persist = async (reply: string) => {
      if (!reply.trim() && steps.length === 0) return;
      const title = `${prompt.replace(/\s+/g, " ").trim().slice(0, 48)} · ${run.modelName}`;
      const chatId = await deps.createChatRecord({ title, projectId });
      linkSubagentChat(chatId, { parentChatId, model: run.modelName, root: worktree });
      if (cliSession) saveCliSession(chatId, cliSession.instanceId, cliSession.sessionId);
      await deps.addMessageRecord({ chatId, role: "user", content: prompt, model: run.modelId });
      await deps.addMessageRecord({
        chatId,
        role: "assistant",
        content: withSteps(reply, steps),
        model: run.modelId,
        todos: todos.length ? todos : undefined,
      });
      patchRun(fanOutId, run.id, { chatId });
    };
    const onStep = (step: KodeToolStep) => {
      const index = steps.findIndex((item) => item.id === step.id);
      if (index >= 0) steps[index] = { ...step };
      else steps.push({ ...step });
      if (steps.length > MAX_RUN_STEPS) steps.splice(0, steps.length - MAX_RUN_STEPS);
      patchRun(fanOutId, run.id, { steps: [...steps] });
    };

    const onText = (delta: string) => {
      text += delta;
      patchRun(fanOutId, run.id, { preview: previewOf(text) });
    };

    const cli = parseCliModelId(run.modelId);
    let stopped = false;
    if (cli) {
      const instance = getProvider(cli.instanceId);
      if (!instance) throw new Error("This provider was removed in Settings → Providers.");
      const result = await runCliTurn({
        instance,
        root: worktree,
        prompt,
        sessionId: null,
        model: cli.model,
        mode,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "text") onText(event.delta);
          if (event.type === "session") cliSession = { instanceId: instance.id, sessionId: event.sessionId };
          if (event.type === "toolStart" || event.type === "toolEnd") {
            onStep(cliToolStep(event, steps.find((item) => item.id === event.id)));
          }
        },
      });
      if (result.sessionId) cliSession = { instanceId: instance.id, sessionId: result.sessionId };
      if (result.error) throw new Error(result.error);
      text = result.text || text;
      stopped = result.stopped;
    } else {
      const result = await runKodeAgent({
        modelId: run.modelId,
        history: [],
        userText: prompt,
        mode,
        projectRoot: worktree,
        onText,
        onReasoning: () => {},
        onToolStep: onStep,
        // Nobody is watching: decline anything that needs a person.
        requestApproval: async (step) => {
          declined.push(step.description || step.name);
          return false;
        },
        requestOptions: async () => [],
        onTodos: (next) => {
          todos = next;
        },
        signal: controller.signal,
      });
      text = result.content || text;
      stopped = !!result.stopped;
    }

    const note = declined.length
      ? `\n\n> Ran without you, so these needed approval and were skipped: ${[...new Set(declined)].join(", ")}.`
      : "";
    await persist((text.trim() + note).trim() || (stopped ? "_Stopped._" : "_No reply._"));
    // A read-only run shares the project's checkout, so its git status would
    // report the parent's own uncommitted work as this run's changes.
    const git = readOnly ? null : await gitStatus(worktree).catch(() => null);
    patchRun(fanOutId, run.id, {
      status: stopped ? "stopped" : "done",
      preview: previewOf(text),
      reply: text.trim().slice(-REPLY_CHARS),
      files: git?.files.length ?? null,
      additions: git?.additions ?? 0,
      deletions: git?.deletions ?? 0,
      finishedAt: Date.now(),
    });
  } catch (error) {
    const aborted = controller.signal.aborted;
    const reason = aborted ? null : error instanceof Error ? error.message : String(error);
    patchRun(fanOutId, run.id, { status: aborted ? "stopped" : "error", error: reason, finishedAt: Date.now() });
    // Keep what it did before it stopped (nothing is saved for a run that
    // never got going).
    await persist(`${text.trim()}\n\n> ${aborted ? "Stopped." : `Failed: ${reason}`}`.trim()).catch(() => {});
  } finally {
    controllers.delete(run.id);
  }
}

// ---------------------------------------------------------------------------
// The `run_subagents` tool for the Kode agent
// ---------------------------------------------------------------------------

export type SubagentModel = { id: string; name: string };

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Match what the model asked for ("claude opus", "codex", an exact id). */
export function resolveSubagentModels(
  requested: string[],
  available: SubagentModel[],
): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const raw of requested) {
    const want = norm(raw);
    if (!want) continue;
    const match =
      available.find((m) => m.id === raw) ??
      available.find((m) => norm(m.name) === want) ??
      available.find((m) => norm(m.name).includes(want) || norm(m.id).includes(want)) ??
      available.find((m) => want.includes(norm(m.name)));
    if (match && !ids.includes(match.id)) ids.push(match.id);
    else if (!match) unknown.push(raw);
  }
  return { ids, unknown };
}

export const SUBAGENT_MODES: KodeAgentMode[] = ["auto_edits", "full_access", "plan"];

/** Every run's outcome, for the agent that started them to compare. */
export function reportRuns(runs: FanOutRun[]): string {
  return runs
    .map((run) => {
      const head = `### ${run.modelName}: ${run.status}`;
      const where = run.worktree
        ? `Branch ${run.branch}, worktree ${run.worktree}`
        : "Read-only, in the project folder";
      const changes = !run.worktree
        ? ""
        : run.files !== null
          ? `${run.files} file(s) changed, +${run.additions} -${run.deletions}`
          : "No change summary";
      const body = run.error ? `Error: ${run.error}` : run.reply ? `Reply:\n${run.reply}` : "";
      return [head, where, changes, body].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

/** Tool the Kode agent calls when the user asks for sub-agents / several models. */
export function buildSubagentTool(input: {
  root: string;
  models: SubagentModel[];
  deps: FanOutDeps;
  /** The chat this agent runs in; its sub-agents show under it. */
  parentChatId?: string | null;
}): KodeExtraTool {
  const { root, models, deps } = input;
  const list = models.map((m) => `${m.name} (${m.id})`).join("; ");
  return {
    needsApproval: true,
    describe: (args) => {
      const n = Array.isArray(args.models) ? args.models.length : 0;
      return `Run ${n || "several"} sub-agent${n === 1 ? "" : "s"}`;
    },
    definition: {
      type: "function",
      function: {
        name: "run_subagents",
        description:
          `Send one task to several models at once, each working in its own git branch and worktree with its own chat, then get every result back to compare. Use it when the user asks for sub-agents, several models, or to compare models on a task. Each sub-agent starts fresh, so write a complete, self-contained task. Available models: ${list}.`,
        parameters: {
          type: "object",
          properties: {
            task: { type: "string", description: "The full task each sub-agent should do." },
            models: {
              type: "array",
              items: { type: "string" },
              description: `Model names or ids from the available list, as many as the user asked for (up to ${MAX_SUBAGENTS}).`,
            },
            mode: {
              type: "string",
              enum: SUBAGENT_MODES,
              description: "auto_edits (default): edits applied, risky commands skipped. full_access: commands run too. plan: read-only proposals.",
            },
          },
          required: ["task", "models"],
        },
      },
    },
    run: async (args, signal) => {
      const task = typeof args.task === "string" ? args.task.trim() : "";
      if (!task) throw new Error("Give the sub-agents a task.");
      const requested = Array.isArray(args.models) ? args.models.map(String) : [];
      const { ids, unknown } = resolveSubagentModels(requested, models);
      if (ids.length === 0) {
        throw new Error(`None of those models are available. Choose from: ${list}.`);
      }
      const mode = SUBAGENT_MODES.includes(args.mode as KodeAgentMode)
        ? (args.mode as KodeAgentMode)
        : "auto_edits";
      const { done } = startFanOut({
        root,
        prompt: task,
        modelIds: ids.slice(0, MAX_SUBAGENTS),
        mode,
        deps,
        parentChatId: input.parentChatId,
        signal,
      });
      const runs = await done;
      const skipped = [
        ...unknown.map((name) => `${name} (not available)`),
        ...ids.slice(MAX_SUBAGENTS).map((id) => `${deps.modelName(id)} (over ${MAX_SUBAGENTS} in one request)`),
      ];
      return [
        `Ran ${runs.length} sub-agent(s). Each has its own chat in the sidebar under its worktree folder.`,
        skipped.length ? `Skipped: ${skipped.join(", ")}.` : "",
        reportRuns(runs),
        "Compare the results for the user. To use one, they can open its chat, or merge its branch.",
      ]
        .filter(Boolean)
        .join("\n\n");
    },
  };
}
