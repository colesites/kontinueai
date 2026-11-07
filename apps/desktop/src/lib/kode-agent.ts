import { htmlToText } from "@repo/ai/lib/docs/indexer";
import { invoke } from "@tauri-apps/api/core";
import type { LanguageModelUsage } from "ai";
import { getSessionToken, type KodeChatMessage, type KodeContentPart, type KodeToolCall, type KodeToolDefinition, sendKodeChat } from "./kode-chat";
import { type DocSourceRef, retrieveDocsContext } from "./kode-docs";
import { createContentFilter, stripKodeArtifacts } from "./kode-sanitize";
import { buildKodeSkillsContext, findSkill, type KodeSkill, loadAllSkills, type RepoProfile, renderSkill } from "./kode-skills";
import {
  buildAskOptionsToolDefinition,
  buildFileToolDefinitions,
  buildKnowledgeToolDefinitions,
  buildShellToolDefinition,
  buildTodosToolDefinition,
  buildWebToolDefinitions,
  describeToolCall,
  executeFileTool,
  impliesFileWork,
  isToolAllowedInMode,
  KODE_ASK_TOOL,
  KODE_LOAD_SKILL_TOOL,
  KODE_PLAN_MODE_PROMPT,
  KODE_SEARCH_DOCS_TOOL,
  KODE_TODOS_TOOL,
  KODE_WEB_SEARCH_TOOL,
  KODE_WEB_TOOLS,
  type KodeAgentMode,
  type KodeTodo,
  needsApproval,
  type ToolArgs,
} from "./kode-tools";

export type KodeToolStepState = "pending-approval" | "pending-options" | "running" | "done" | "error" | "rejected";

// A single tool invocation surfaced to the UI (rendered as a Tool/Confirmation card).
export type KodeToolStep = {
  id: string;
  name: string;
  args: ToolArgs;
  description: string;
  state: KodeToolStepState;
  result?: string;
};

export type RunKodeAgentParams = {
  /** Fast mode: use the model's fast variant when the plan allows it. */
  fast?: boolean;
  /** Requested reasoning effort (the server maps it to what the model supports). */
  reasoningEffort?: string;
  modelId: string;
  /** Prior user/assistant text turns (no tool messages). */
  history: KodeChatMessage[];
  userText: string;
  /** Multimodal content (text + images) for the user turn; overrides userText when set. */
  userContent?: KodeContentPart[];
  mode: KodeAgentMode;
  /** Absolute on-disk path of the active project, or null if none is open. */
  projectRoot: string | null;
  /** Extra system guidance (e.g. an imported coding-session continuation brief). */
  extraSystemContext?: string;
  onText: (delta: string) => void;
  onReasoning: (delta: string) => void;
  /** Upsert a tool step by id (render or update its card). */
  onToolStep: (step: KodeToolStep) => void;
  /** Resolve true to run the tool, false to reject it. */
  requestApproval: (step: KodeToolStep) => Promise<boolean>;
  /** Resolve with the option value(s) the user selected for an ask_options call. */
  requestOptions: (step: KodeToolStep) => Promise<string[]>;
  /** Called when the model updates its plan/todo list. */
  onTodos?: (todos: KodeTodo[]) => void;
  maxIterations?: number;
  reasoningEnabled?: boolean;
  /** Abort the run between/within steps (the Stop button). */
  signal?: AbortSignal;
};

export type RunKodeAgentResult = {
  content: string;
  /** The LAST model call's usage — represents the current context size (for the
   *  context meter). NOT the whole turn's cost. */
  usage?: LanguageModelUsage;
  /** SUM of tokens across every model call this turn (all agent iterations) — the
   *  real cost of the turn, used to meter token-based usage/billing. */
  tokensConsumed: number;
  /** Official-docs sources that grounded this answer (for the Sources element). */
  sources: DocSourceRef[];
  /** True when the user stopped the run via the Stop button. */
  stopped?: boolean;
};

/** Reject as soon as `signal` aborts, so an in-flight model call can be cut off
 *  immediately rather than waiting for it to finish. */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function parseArgs(raw: string): ToolArgs {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as ToolArgs) : {};
  } catch {
    return {};
  }
}

// Which tool definitions to expose for the current mode. Plan mode is read-only,
// so the model only ever sees the read tools and literally cannot request a write.
function toolsForMode(mode: KodeAgentMode): KodeToolDefinition[] {
  const ask = buildAskOptionsToolDefinition();
  const todos = buildTodosToolDefinition();
  if (mode === "plan") {
    // Read-only: inspection tools + ask the user + maintain a plan.
    return [...buildFileToolDefinitions().filter((tool) => ["read_file", "list_dir"].includes(tool.function.name)), ask, todos, ...buildWebToolDefinitions(), ...buildKnowledgeToolDefinitions()];
  }
  return [...buildFileToolDefinitions(), buildShellToolDefinition(), ask, todos, ...buildWebToolDefinitions(), ...buildKnowledgeToolDefinitions()];
}

const MAX_WEB_RESULT_CHARS = 8000;

/** Run web_search (Kontinue server) or fetch_url (local fetch → text). */
async function executeWebTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === KODE_WEB_SEARCH_TOOL) {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) throw new Error("Missing search query.");
    const token = await getSessionToken();
    if (!token) throw new Error("Sign in to search the web.");
    const result = await invoke<{
      results: string;
      sources: { title: string; url: string }[];
    }>("kontinue_api_post", {
      path: "/api/kode/search",
      sessionToken: token,
      body: { query },
    });
    if (!result.results) return "No results found.";
    const sources = result.sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join("\n");
    return `${result.results}\n\nSources:\n${sources}`.slice(0, MAX_WEB_RESULT_CHARS);
  }
  const url = typeof args.url === "string" ? args.url.trim() : "";
  if (!/^https?:\/\//i.test(url)) throw new Error("fetch_url needs a full http(s) URL.");
  const raw = await invoke<string>("kode_fetch_text", { url });
  const text = /<\/?[a-z][\s\S]*>/i.test(raw) ? htmlToText(raw) : raw;
  return text.length > MAX_WEB_RESULT_CHARS ? `${text.slice(0, MAX_WEB_RESULT_CHARS)}\n…(truncated)` : text || "(empty page)";
}

/**
 * Run the Kode agent loop: stream model output, execute any tool calls (with
 * mode-based approval), feed results back, and repeat until the model returns a
 * final answer with no further tool calls.
 */
export async function runKodeAgent(params: RunKodeAgentParams): Promise<RunKodeAgentResult> {
  const {
    modelId,
    history,
    userText,
    userContent,
    mode,
    projectRoot,
    extraSystemContext,
    onText,
    onReasoning,
    onToolStep,
    requestApproval,
    requestOptions,
    onTodos,
    // Each file read/write/edit/run/ask is one step, so a real "build X" task
    // burns several quickly. Token budgets now bound runaway cost, so this can be
    // generous without risking an infinite loop.
    maxIterations = 25,
    reasoningEnabled,
    fast = false,
    reasoningEffort,
    signal,
  } = params;

  const messages: KodeChatMessage[] = [
    ...history,
    {
      role: "user",
      content: userContent && userContent.length > 0 ? userContent : userText,
    },
  ];

  // No open project or the (disabled) design mode → plain chat, no file tools.
  const toolsEnabled = Boolean(projectRoot) && mode !== "design";
  const tools = toolsEnabled ? toolsForMode(mode) : undefined;
  // Force the model to call a tool on the first turn when the request clearly
  // implies file work — weak models otherwise paste code into chat instead of
  // acting. Don't force in Plan (read-only) — let it reason and choose.
  const forceFirstTool = toolsEnabled && mode !== "plan" && impliesFileWork(userText);

  // Inspect the repo (framework / package manager / deps) so skill selection and
  // the prompt are repo-aware. Best-effort — falls back to query-only selection.
  let repoProfile: RepoProfile = {};
  if (projectRoot) {
    try {
      const raw = await invoke<{
        framework: string | null;
        package_manager: string | null;
        tags: string[];
      }>("kode_repo_profile", { root: projectRoot });
      repoProfile = {
        framework: raw.framework,
        packageManager: raw.package_manager,
        tags: raw.tags,
      };
    } catch {
      // Ignore — proceed without repo context.
    }
  }
  // Skills index (bundled + project skills) and repo summary. Full skills and
  // docs are loaded on demand with load_skill / search_docs, so they only cost
  // context when the task needs them.
  let skills: KodeSkill[] = [];
  try {
    skills = await loadAllSkills(projectRoot);
  } catch {
    // Proceed without skills.
  }
  const sources: DocSourceRef[] = [];
  const systemContext = `${buildKodeSkillsContext(repoProfile, skills)}${extraSystemContext ? `\n\n${extraSystemContext}` : ""}${mode === "plan" ? `\n\n${KODE_PLAN_MODE_PROMPT}` : ""}`;

  let finalContent = "";
  const narrations: string[] = [];
  // `usage` = the latest call (context-size signal for the meter).
  // `tokensConsumed` = running sum across all calls (turn cost for billing).
  let usage: LanguageModelUsage | undefined;
  let tokensConsumed = 0;

  let stopped = false;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (signal?.aborted) {
      stopped = true;
      break;
    }

    // Filter the streamed content so models that emit tool calls as raw text
    // (e.g. free Gemma's `<|tool_call>call:...`) don't leak control tokens into
    // the visible message. See kode-sanitize.ts. We also accumulate the streamed
    // text so that if the user Stops mid-response, the turn just ends with what
    // was generated (like any chatbot's stop) instead of discarding it.
    let streamedThisCall = "";
    const contentFilter = createContentFilter((delta) => {
      streamedThisCall += delta;
      onText(delta);
    });
    let response: Awaited<ReturnType<typeof sendKodeChat>>;
    try {
      response = await abortable(
        sendKodeChat({
          modelId,
          messages,
          tools,
          systemContext,
          reasoningEnabled,
          kontinueServer: true,
          fast,
          reasoningEffort,
          // Only force on the very first turn; later turns use "auto" so the model
          // can stop calling tools and write its final answer.
          toolChoice: iteration === 0 && forceFirstTool ? "required" : "auto",
          onEvent: (event) => {
            if (signal?.aborted) return;
            if (event.type === "reasoning") onReasoning(event.delta);
            else contentFilter.push(event.delta);
          },
        }),
        signal,
      );
    } catch (error) {
      if (signal?.aborted || (error as Error)?.name === "AbortError") {
        contentFilter.flush();
        const partial = streamedThisCall.trim();
        if (partial) {
          finalContent = partial;
          narrations.push(partial);
        }
        stopped = true;
        break;
      }
      throw error;
    }
    contentFilter.flush();
    usage = response.usage ?? usage;
    tokensConsumed += response.usage?.totalTokens ?? 0;
    finalContent = stripKodeArtifacts(response.content);
    if (finalContent.trim()) narrations.push(finalContent.trim());

    if (response.toolCalls.length === 0) {
      return {
        content: closingText(narrations, finalContent),
        usage,
        tokensConsumed,
        sources,
      };
    }

    // Record the assistant turn that requested the tools (required so the model
    // can correlate the tool results we append next).
    messages.push({
      role: "assistant",
      content: finalContent ? finalContent : null,
      tool_calls: response.toolCalls,
    });

    for (const call of response.toolCalls) {
      const result = await handleToolCall(call, {
        mode,
        projectRoot,
        onToolStep,
        requestApproval,
        requestOptions,
        onTodos,
        skills,
        framework: repoProfile.framework ?? null,
        addSources: (found) => {
          for (const source of found) {
            if (!sources.some((existing) => existing.url === source.url)) sources.push(source);
          }
        },
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }

    if (signal?.aborted) {
      stopped = true;
      break;
    }
  }

  if (stopped) {
    // Ended by the user — keep whatever was generated; only fall back to a marker
    // if nothing had streamed yet.
    return {
      content: closingText(narrations, finalContent) || "_Stopped._",
      usage,
      tokensConsumed,
      sources,
      stopped: true,
    };
  }

  return {
    content: closingText(narrations, finalContent) || "Reached the maximum number of steps for this response.",
    usage,
    tokensConsumed,
    sources,
  };
}

/** The model's own words. Tool names are not a closing report. */
function closingText(narrations: string[], fallback: string) {
  const unique: string[] = [];
  for (const note of narrations) {
    if (unique[unique.length - 1] !== note) unique.push(note);
  }
  const prose = unique.join("\n\n").trim();
  return prose || fallback.trim();
}

async function handleToolCall(
  call: KodeToolCall,
  ctx: {
    mode: KodeAgentMode;
    projectRoot: string | null;
    onToolStep: (step: KodeToolStep) => void;
    requestApproval: (step: KodeToolStep) => Promise<boolean>;
    requestOptions: (step: KodeToolStep) => Promise<string[]>;
    onTodos?: (todos: KodeTodo[]) => void;
    skills: KodeSkill[];
    framework: string | null;
    addSources: (sources: DocSourceRef[]) => void;
  },
): Promise<string> {
  const name = call.function.name;
  const args = parseArgs(call.function.arguments);
  const step: KodeToolStep = {
    id: call.id,
    name,
    args,
    description: describeToolCall(name, args),
    state: "running",
  };

  // update_todos just records the model's plan for the UI — no fs op, no approval.
  if (name === KODE_TODOS_TOOL) {
    const todos = Array.isArray(args.todos) ? (args.todos as KodeTodo[]) : [];
    ctx.onTodos?.(todos);
    step.state = "done";
    step.result = `Updated plan (${todos.length} item${todos.length === 1 ? "" : "s"}).`;
    return step.result;
  }

  // ask_options is an interaction, not a filesystem op — render the choices and
  // wait for the user's selection regardless of mode or project state.
  if (name === KODE_ASK_TOOL) {
    step.state = "pending-options";
    ctx.onToolStep(step);
    const selected = await ctx.requestOptions(step);
    step.state = "done";
    step.result = selected.length > 0 ? `User selected: ${selected.join(", ")}` : "User did not select anything.";
    ctx.onToolStep(step);
    return step.result;
  }

  // Skills and docs: read-only, no project needed.
  if (name === KODE_LOAD_SKILL_TOOL || name === KODE_SEARCH_DOCS_TOOL) {
    let output: string;
    if (name === KODE_LOAD_SKILL_TOOL) {
      const skill = findSkill(ctx.skills, typeof args.name === "string" ? args.name : "");
      output = skill ? renderSkill(skill) : `No skill named "${String(args.name)}". Available: ${ctx.skills.map((s) => s.name).join(", ")}`;
    } else {
      const query = typeof args.query === "string" ? args.query : "";
      const docs = await retrieveDocsContext(query, ctx.framework).catch(() => ({ context: "", sources: [] }));
      ctx.addSources(docs.sources);
      output = docs.context.trim() || "No matching docs found. Try web_search.";
    }
    step.state = "done";
    step.result = output;
    ctx.onToolStep(step);
    return output;
  }

  // Web tools don't touch the project and never need approval.
  if (KODE_WEB_TOOLS.has(name)) {
    step.state = "running";
    ctx.onToolStep(step);
    try {
      const output = await executeWebTool(name, args);
      step.state = "done";
      step.result = output;
      ctx.onToolStep(step);
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      step.state = "error";
      step.result = message;
      ctx.onToolStep(step);
      return `Error: ${message}`;
    }
  }

  if (!ctx.projectRoot) {
    step.state = "error";
    step.result = "No project folder is open, so file tools are unavailable.";
    ctx.onToolStep(step);
    return step.result;
  }

  if (!isToolAllowedInMode(name, ctx.mode)) {
    step.state = "rejected";
    step.result = `Refused: ${name} is not allowed in Plan mode (read-only).`;
    ctx.onToolStep(step);
    return step.result;
  }

  if (needsApproval(name, ctx.mode, args)) {
    step.state = "pending-approval";
    ctx.onToolStep(step);
    const approved = await ctx.requestApproval(step);
    if (!approved) {
      step.state = "rejected";
      step.result = "The user rejected this action.";
      ctx.onToolStep(step);
      return step.result;
    }
  }

  step.state = "running";
  ctx.onToolStep(step);
  try {
    const output = await executeFileTool(name, args, ctx.projectRoot);
    step.state = "done";
    step.result = output;
    ctx.onToolStep(step);
    return output || "(done)";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    step.state = "error";
    step.result = message;
    ctx.onToolStep(step);
    return `Error: ${message}`;
  }
}
