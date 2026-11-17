// App side of Kode's orchestration MCP server (src-tauri/src/kode_mcp_server.rs).
//
// Other agents run `<Kontinue> --kode-mcp` and get tools to list projects and
// threads, start threads in any repo, message threads and hand off context.
// The server only reads ~/.kontinue/kode/state.json (which we publish here)
// and queues requests in inbox.jsonl (which we carry out here). Prompts are
// sent through the scheduler, so they go out the same way a queued prompt
// does: right away in the open chat, or with a "ready" bar elsewhere.

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { schedulePrompt } from "./kode-schedule";
import { useKodeWorkspace, type KodeChat } from "./kode-workspace";
import {
  getFanOut,
  getSubagentModels,
  reportRuns,
  resolveSubagentModels,
  startFanOut,
  subscribeFanOuts,
  SUBAGENT_MODES,
  useSubagentModels,
  type FanOutDeps,
  type PublishedModel,
} from "./kode-fanout";
import type { KodeAgentMode } from "./kode-tools";

export type OrchestrationState = {
  updatedAt: number;
  projects: { id: string; name: string; path: string }[];
  threads: {
    id: string;
    title: string;
    projectName: string | null;
    projectPath: string | null;
    updatedAt: number;
    importedFrom: string | null;
  }[];
  /** Models that can run as sub-agents (MCP list_models / run_subagents). */
  models?: { id: string; name: string }[];
};

export type InboxRequest =
  | { id: string; type: "start_thread"; projectPath: string; prompt: string; title?: string | null }
  | { id: string; type: "message_thread"; threadId: string; message: string }
  | { id: string; type: "handoff"; projectPath: string; summary: string; nextStep?: string | null; files?: string[] }
  | {
      id: string;
      type: "run_subagents";
      parentChatId: string;
      projectPath: string;
      task: string;
      models: string[];
      mode?: string | null;
    };

export type InboxAction =
  | { kind: "new_thread"; projectPath: string; title: string; prompt: string }
  | { kind: "message"; chatId: string; text: string };

export function buildOrchestrationState(
  folders: { id: string; name: string; path: string }[],
  chats: KodeChat[],
  now = Date.now(),
): OrchestrationState {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  return {
    updatedAt: now,
    projects: folders.map(({ id, name, path }) => ({ id, name, path })),
    threads: [...chats]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 300)
      .map((chat) => {
        const folder = chat.projectId ? byId.get(chat.projectId) : undefined;
        return {
          id: chat.id,
          title: chat.title,
          projectName: folder?.name ?? null,
          projectPath: folder?.path ?? chat.importSource?.projectPath ?? null,
          updatedAt: chat.updatedAt,
          importedFrom: chat.importSource?.provider ?? null,
        };
      }),
  };
}

export function handoffPrompt(request: Extract<InboxRequest, { type: "handoff" }>): string {
  const lines = ["## Hand-off from another agent", "", request.summary.trim()];
  if (request.files?.length) {
    lines.push("", "Files involved:", ...request.files.slice(0, 50).map((file) => `- ${file}`));
  }
  lines.push(
    "",
    request.nextStep?.trim() ? `Next step: ${request.nextStep.trim()}` : "Continue from here.",
    "",
    "Check the files on disk before editing; they may have changed since this hand-off.",
  );
  return lines.join("\n");
}

/** What to do for one queued request (null = ignore it). */
export function planInboxRequest(request: InboxRequest, chats: { id: string }[]): InboxAction | null {
  switch (request.type) {
    case "start_thread":
      if (!request.projectPath || !request.prompt?.trim()) return null;
      return {
        kind: "new_thread",
        projectPath: request.projectPath,
        title: request.title?.trim() || request.prompt.trim().split("\n")[0].slice(0, 60),
        prompt: request.prompt,
      };
    case "message_thread":
      if (!chats.some((chat) => chat.id === request.threadId) || !request.message?.trim()) return null;
      return { kind: "message", chatId: request.threadId, text: request.message };
    case "handoff":
      if (!request.projectPath || !request.summary?.trim()) return null;
      return {
        kind: "new_thread",
        projectPath: request.projectPath,
        title: `Hand-off: ${(request.nextStep ?? request.summary).trim().split("\n")[0].slice(0, 50)}`,
        prompt: handoffPrompt(request),
      };
    default:
      return null;
  }
}

/** Start the sub-agents an agent asked for over MCP and keep its results file
 *  (kode_orch_write_result) current until they finish. */
export function runSubagentRequest(
  request: Extract<InboxRequest, { type: "run_subagents" }>,
  deps: FanOutDeps,
): void {
  const write = (result: unknown) =>
    void invoke("kode_orch_write_result", { id: request.id, result }).catch(() => {});
  const models: PublishedModel[] = getSubagentModels();
  const { ids, unknown } = resolveSubagentModels(request.models ?? [], models);
  if (ids.length === 0) {
    const names = models.map((m) => m.name).join(", ") || "none yet (open a chat in Kontinue first)";
    write({ done: true, report: `None of those models are available. Choose from: ${names}.` });
    return;
  }
  const mode = SUBAGENT_MODES.includes(request.mode as KodeAgentMode) ? (request.mode as KodeAgentMode) : "auto_edits";
  const { id, done } = startFanOut({
    root: request.projectPath,
    prompt: request.task.trim(),
    modelIds: ids,
    mode,
    deps,
    parentChatId: request.parentChatId,
  });
  // Progress for wait_for_subagents, at most once a second.
  let pending: number | null = null;
  const progress = () => {
    if (pending !== null) return;
    pending = window.setTimeout(() => {
      pending = null;
      const fanOut = getFanOut(id);
      if (!fanOut) return;
      write({
        done: false,
        runs: fanOut.runs.map((run) => ({ model: run.modelName, status: run.status })),
      });
    }, 1_000);
  };
  const unsubscribe = subscribeFanOuts(progress);
  progress();
  void done.then((runs) => {
    unsubscribe();
    if (pending !== null) window.clearTimeout(pending);
    const skipped = unknown.length ? `Skipped (not available): ${unknown.join(", ")}.` : "";
    write({
      done: true,
      report: [
        `Ran ${runs.length} sub-agent(s). Each has its own chat in Kontinue under its worktree folder.`,
        skipped,
        reportRuns(runs),
        "Compare the results for the user. To use one, they can open its chat, or merge its branch.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
  });
}

export async function mcpServerCommand(): Promise<{ command: string; args: string[] } | null> {
  try {
    return await invoke<{ command: string; args: string[] }>("kode_mcp_server_command");
  } catch {
    return null;
  }
}

const INBOX_POLL_MS = 4_000;

/** Mount once (ViewLayout): publish state, carry out queued requests. */
export function useOrchestrationBridge() {
  const { folders, kodeChats, ensureFolder, createKodeChatRecord, addMessageRecord } = useKodeWorkspace();
  const models = useSubagentModels();
  const latest = useRef({ folders, kodeChats, ensureFolder, createKodeChatRecord, addMessageRecord });
  latest.current = { folders, kodeChats, ensureFolder, createKodeChatRecord, addMessageRecord };

  // Publish state (debounced) whenever projects, threads or models change.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const state = {
        ...buildOrchestrationState(folders, kodeChats),
        models: models.map(({ id, name }) => ({ id, name })),
      };
      void invoke("kode_orch_write_state", { state }).catch(() => {});
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [folders, kodeChats, models]);

  useEffect(() => {
    let running = false;
    const take = async () => {
      if (running) return;
      running = true;
      try {
        const requests = await invoke<InboxRequest[]>("kode_orch_take_inbox").catch(() => []);
        for (const request of requests) {
          const { kodeChats: chats, ensureFolder: ensure, createKodeChatRecord: create } = latest.current;
          if (request.type === "run_subagents") {
            const nameOf = (modelId: string) => getSubagentModels().find((m) => m.id === modelId);
            runSubagentRequest(request, {
              ensureFolder: ensure,
              createChatRecord: create,
              addMessageRecord: latest.current.addMessageRecord,
              modelName: (modelId) => nameOf(modelId)?.name ?? modelId,
              modelProvider: (modelId) => nameOf(modelId)?.provider,
            });
            continue;
          }
          const action = planInboxRequest(request, chats);
          if (!action) continue;
          let chatId: string;
          let chatTitle: string | null = null;
          if (action.kind === "new_thread") {
            const folderId = ensure(action.projectPath);
            chatId = await create({ title: action.title, projectId: folderId });
            chatTitle = action.title;
          } else {
            chatId = action.chatId;
            chatTitle = chats.find((chat) => chat.id === chatId)?.title ?? null;
          }
          schedulePrompt({
            chatId,
            chatTitle,
            text: action.kind === "new_thread" ? action.prompt : action.text,
            modelId: KODE_MODEL_ID,
            mode: "supervised",
            fireAt: Date.now(),
            reason: "manual",
          });
        }
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(() => void take(), INBOX_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);
}
