// Multi-model sub-agents: one task sent to several models at once, each in
// its own git worktree (~/.kontinue/worktrees/<repo>/<branch>, see
// panel_git_worktree_add) and its own Kode chat. Started from a prompt: the
// Kode agent calls the `run_subagents` tool (buildSubagentTool) and gets every
// result back to compare. Runs are unattended: edits are accepted, and anything
// that would need your approval is declined.

import { invoke } from "@tauri-apps/api/core";
import { gitStatus } from "@/components/panel/panel-api";
import { runKodeAgent, type KodeExtraTool } from "./kode-agent";
import { getProvider, parseCliModelId, runCliTurn, saveCliSession } from "./kode-cli";
import type { KodeAgentMode, KodeTodo } from "./kode-tools";

export type FanOutRunStatus = "starting" | "running" | "done" | "error" | "stopped";

export type FanOutRun = {
  id: string;
  modelId: string;
  modelName: string;
  status: FanOutRunStatus;
  chatId: string | null;
  worktree: string | null;
  branch: string;
  /** Last bit of the reply, for status. */
  preview: string;
  /** End of the final reply, for the calling agent to compare. */
  reply: string;
  error: string | null;
  files: number | null;
  additions: number;
  deletions: number;
  startedAt: number;
  finishedAt: number | null;
};

export type FanOut = {
  id: string;
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
};

// ---------------------------------------------------------------------------
// Run state (in memory: the chats are what persists)
// ---------------------------------------------------------------------------

const EMPTY: FanOut[] = [];
let fanOuts: FanOut[] = EMPTY;
const controllers = new Map<string, AbortController>();

function emit(next: FanOut[]) {
  fanOuts = next.length ? next : EMPTY;
}

function patchRun(fanOutId: string, runId: string, patch: Partial<FanOutRun>) {
  emit(
    fanOuts.map((f) =>
      f.id !== fanOutId ? f : { ...f, runs: f.runs.map((r) => (r.id === runId ? { ...r, ...patch } : r)) },
    ),
  );
}

export function stopFanOutRun(runId: string) {
  controllers.get(runId)?.abort();
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

/** "kode/fix-login-claude-opus-k3f9" style branch names. */
export function fanOutBranch(prompt: string, modelName: string, suffix: string): string {
  const slug = (text: string, max: number) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "");
  return `kode/${slug(prompt, 24) || "task"}-${slug(modelName, 20) || "model"}-${suffix}`;
}

const REPLY_CHARS = 2_000;
const previewOf = (text: string) => text.replace(/\s+/g, " ").trim().slice(-160);

/** Start one sub-agent per model; `done` resolves with every run's outcome. */
export function startFanOut(input: {
  root: string;
  prompt: string;
  modelIds: string[];
  mode: KodeAgentMode;
  deps: FanOutDeps;
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
      status: "starting",
      chatId: null,
      worktree: null,
      branch: fanOutBranch(prompt, modelName, `${suffix}${index}`),
      preview: "",
      reply: "",
      error: null,
      files: null,
      additions: 0,
      deletions: 0,
      startedAt: Date.now(),
      finishedAt: null,
    };
  });
  emit([{ id, prompt, mode, createdAt: Date.now(), runs }, ...fanOuts]);
  input.signal?.addEventListener("abort", () => runs.forEach((run) => stopFanOutRun(run.id)), {
    once: true,
  });
  const done = Promise.all(runs.map((run) => runOne(id, run, root, prompt, mode, deps))).then(
    () => fanOuts.find((f) => f.id === id)?.runs ?? runs,
  );
  return { id, done };
}

async function runOne(
  fanOutId: string,
  run: FanOutRun,
  root: string,
  prompt: string,
  mode: KodeAgentMode,
  deps: FanOutDeps,
) {
  const controller = new AbortController();
  controllers.set(run.id, controller);
  let text = "";
  let todos: KodeTodo[] = [];
  const declined: string[] = [];
  try {
    const worktree = await invoke<string>("panel_git_worktree_add", { root, branch: run.branch });
    const projectId = deps.ensureFolder(worktree);
    const title = `${prompt.replace(/\s+/g, " ").trim().slice(0, 48)} · ${run.modelName}`;
    const chatId = await deps.createChatRecord({ title, projectId });
    patchRun(fanOutId, run.id, { worktree, chatId, status: "running" });

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
          if (event.type === "session") saveCliSession(chatId, instance.id, event.sessionId);
        },
      });
      if (result.sessionId) saveCliSession(chatId, instance.id, result.sessionId);
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
        onToolStep: () => {},
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
    await deps.addMessageRecord({ chatId, role: "user", content: prompt, model: run.modelId });
    await deps.addMessageRecord({
      chatId,
      role: "assistant",
      content: (text.trim() + note).trim() || (stopped ? "_Stopped._" : "_No reply._"),
      model: run.modelId,
      todos: todos.length ? todos : undefined,
    });
    const git = await gitStatus(worktree).catch(() => null);
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
    patchRun(fanOutId, run.id, {
      status: aborted ? "stopped" : "error",
      error: aborted ? null : error instanceof Error ? error.message : String(error),
      finishedAt: Date.now(),
    });
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

const SUBAGENT_MODES: KodeAgentMode[] = ["auto_edits", "full_access", "plan"];

function reportRuns(runs: FanOutRun[]): string {
  return runs
    .map((run) => {
      const head = `### ${run.modelName}: ${run.status}`;
      const where = run.worktree ? `Branch ${run.branch}, worktree ${run.worktree}` : `Branch ${run.branch}`;
      const changes =
        run.files !== null ? `${run.files} file(s) changed, +${run.additions} -${run.deletions}` : "No change summary";
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
              description: "2 to 4 model names or ids from the available list.",
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
      const { done } = startFanOut({ root, prompt: task, modelIds: ids.slice(0, 4), mode, deps, signal });
      const runs = await done;
      const skipped = [
        ...unknown.map((name) => `${name} (not available)`),
        ...ids.slice(4).map((id) => `${deps.modelName(id)} (limit is 4)`),
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
