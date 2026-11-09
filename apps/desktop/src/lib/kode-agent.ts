import { invoke } from "@tauri-apps/api/core";
import type { LanguageModelUsage } from "ai";
import { getSessionToken, type KodeChatMessage, type KodeContentPart, type KodeToolCall, type KodeToolDefinition, sendKodeChat } from "./kode-chat";
import { createContentFilter, stripKodeArtifacts } from "./kode-sanitize";
import { callMcpTool, getMcpPermission, mcpToolName, parseMcpToolName, setMcpPermission } from "./kode-mcp";
import { buildKodeSkillsContext, enabledSkills, findSkill, type KodeSkill, loadAllSkills, listSkillFiles, readSkillFile, type RepoProfile, renderSkill } from "./kode-skills";
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
  KODE_READ_SKILL_FILE_TOOL,
  KODE_TODOS_TOOL,
  KODE_WEB_SEARCH_TOOL,
  KODE_WEB_TOOLS,
  type KodeAgentMode,
  type KodeTodo,
  needsApproval,
  buildBackgroundToolDefinitions,
  normalizeTodos,
  type ToolArgs,
} from "./kode-tools";

/** Crude HTML → text for the fetch_url tool (no renderer CORS). */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// "Deny, and tell Kode what to do instead": the note rides along with the denial.
const denialNotes = new Map<string, string>();

/** Attach what the user wants instead to the next denial of this step. */
export function setDenialNote(stepId: string, note: string) {
  if (note.trim()) denialNotes.set(stepId, note.trim());
}

function declineMessage(stepId: string, base: string): string {
  const note = denialNotes.get(stepId);
  denialNotes.delete(stepId);
  return note ? `${base} They said what to do instead: ${note}` : base;
}

/** Nudge the model to update its checklist after this many tool calls without one. */
const CHECKLIST_NUDGE_AFTER = 5;

/** Lets the agent answer with interactive charts / diagrams (rich-blocks.tsx). */
const KODE_ARTIFACT_HINT =
  "\n\nWhen the user should run a command themselves, put it in its own ```bash block, one command per block, with no $ prompt: the app shows Run and Copy buttons on it. When a chart, diagram or small interactive view explains something better than text, put a self-contained HTML document (inline CSS/JS; scripts may load from cdn.jsdelivr.net) in a ```kode-artifact fenced block. It renders in a sandboxed frame; use the CSS variables --bg, --fg, --muted, --border and --accent so it fits light and dark themes.";

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
  /** The chat this run belongs to (background tasks are listed per chat). */
  chatId?: string | null;
  /** Extra system guidance (e.g. an imported coding-session continuation brief). */
  extraSystemContext?: string;
  /** Skill names that were loaded/invoked in prior turns — injected upfront so a
   *  model switch keeps the task's active skill context. */
  activeSkills?: string[];
  /** Tools discovered from connected MCP servers, appended to the toolset. */
  mcpTools?: KodeToolDefinition[];
  /** App-provided tools (e.g. run_subagents), run in the app; not in Plan mode. */
  extraTools?: KodeExtraTool[];
  /** Plugin hooks around each tool call (PreToolUse / PostToolUse). */
  toolHooks?: {
    /** A reason to block the call, or null to allow it. */
    before?: (name: string, args: Record<string, unknown>) => Promise<string | null>;
    /** Extra context to add to the tool result. */
    after?: (name: string, args: Record<string, unknown>, result: string) => Promise<string[]>;
  };
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

/** A tool the app runs itself. `run` returns the text the model sees. */
export type KodeExtraTool = {
  definition: KodeToolDefinition;
  /** Short label for the tool card. */
  describe: (args: Record<string, unknown>) => string;
  /** Ask before running in Supervised mode. */
  needsApproval?: boolean;
  run: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<string>;
};

export type RunKodeAgentResult = {
  content: string;
  /** The LAST model call's usage — represents the current context size (for the
   *  context meter). NOT the whole turn's cost. */
  usage?: LanguageModelUsage;
  /** SUM of tokens across every model call this turn (all agent iterations) — the
   *  real cost of the turn, used to meter token-based usage/billing. */
  tokensConsumed: number;
  /** Skill names loaded via `load_skill` this turn, for active-skill tracking. */
  loadedSkills: string[];
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
function toolsForMode(mode: KodeAgentMode, mcpTools: KodeToolDefinition[]): KodeToolDefinition[] {
  const ask = buildAskOptionsToolDefinition();
  const todos = buildTodosToolDefinition();
  if (mode === "plan") {
    // Read-only: inspection tools + ask the user + maintain a plan.
    return [...buildFileToolDefinitions().filter((tool) => ["read_file", "list_dir"].includes(tool.function.name)), ask, todos, ...buildWebToolDefinitions(), ...buildKnowledgeToolDefinitions()];
  }
  return [...buildFileToolDefinitions(), buildShellToolDefinition(), ...buildBackgroundToolDefinitions(), ask, todos, ...buildWebToolDefinitions(), ...buildKnowledgeToolDefinitions(), ...mcpTools];
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
    chatId = null,
    modelId,
    history,
    userText,
    userContent,
    mode,
    projectRoot,
    extraSystemContext,
    activeSkills = [],
    mcpTools = [],
    extraTools = [],
    toolHooks,
    onText,
    onReasoning,
    onToolStep,
    requestApproval,
    requestOptions,
    onTodos,
    // Each file read/write/edit/run/ask is one step, so a real "build X" task
    // burns several quickly. Token budgets now bound runaway cost, so this can be
    // generous without risking an infinite loop.
    maxIterations = 48,
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
  const tools = toolsEnabled
    ? [
        ...toolsForMode(mode, mcpTools),
        ...(mode === "plan" ? [] : extraTools.map((tool) => tool.definition)),
      ]
    : undefined;
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
  // Skills index (bundled + project skills) and repo summary. Full skills are
  // loaded on demand with load_skill; the active ones are injected upfront so a
  // model switch keeps the task's guidance.
  let skills: KodeSkill[] = [];
  try {
    skills = enabledSkills(await loadAllSkills(projectRoot));
  } catch {
    // Proceed without skills.
  }
  const activeSkillBodies = activeSkills
    .map((name) => findSkill(skills, name))
    .filter((skill): skill is KodeSkill => Boolean(skill));
  const activeBlock = activeSkillBodies.length
    ? `\n\nACTIVE SKILLS — you are using these skills for this task. Follow them over generic advice.\n${activeSkillBodies.map((skill) => renderSkill(skill)).join("\n\n---\n\n")}`
    : "";
  const systemContext = `${buildKodeSkillsContext(repoProfile, skills)}${activeBlock}${extraSystemContext ? `\n\n${extraSystemContext}` : ""}${mode === "plan" ? `\n\n${KODE_PLAN_MODE_PROMPT}` : ""}\n\nFinish the task you were asked to do. Do not stop after searching, and do not repeat the same search. For any task with more than one step, your first tool call is update_todos: a short checklist, exactly one item in_progress. Update that checklist the moment each item finishes (mark it completed and the next one in_progress), so the user sees live progress. Do not end the turn while any item is still pending or in progress. Cancel an item only when you are deliberately dropping it. End the turn with a short report in the message: what you did, and what you did not do. If nothing is left, say so. Decisions that belong to the user go through ask_options (single, multi, text, confirm, or a short questionnaire), not as a questionnaire written into the message.${KODE_ARTIFACT_HINT}`;

  let finalContent = "";
  const narrations: string[] = [];
  let latestTodos: KodeTodo[] = [];
  // Tool calls since the checklist was last updated (see the nudge below).
  let workSinceChecklist = 0;
  let didWork = false;
  const loadedSkills: string[] = [];
  // 0 working, 1 refresh the checklist, 2 write the closing report.
  let closePhase = 0;
  const wantsChecklist = toolsEnabled && (forceFirstTool || mode === "plan");
  // `usage` = the latest call (context-size signal for the meter).
  // `tokensConsumed` = running sum across all calls (turn cost for billing).
  let usage: LanguageModelUsage | undefined;
  let tokensConsumed = 0;

  let stopped = false;
  // Whether any visible text has streamed in this turn yet.
  let streamedEarlier = false;

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
      // Text from an earlier step of this turn is already on screen: start
      // this step's text on a new paragraph instead of gluing it on.
      if (!streamedThisCall.trim() && streamedEarlier && delta.trim()) onText("\n\n");
      streamedThisCall += delta;
      if (delta.trim()) streamedEarlier = true;
      onText(delta);
    });
    let response: Awaited<ReturnType<typeof sendKodeChat>>;
    const finishing = iteration === maxIterations - 1 || closePhase === 2;
    const checklistTool = { type: "function" as const, function: { name: KODE_TODOS_TOOL } };
    try {
      response = await abortable(
        sendKodeChat({
          modelId,
          messages,
          tools: finishing ? undefined : tools,
          systemContext,
          reasoningEnabled,
          kontinueServer: true,
          fast,
          reasoningEffort,
          // The closing report cannot call tools. A real task starts with the
          // checklist, and an unfinished list is refreshed once before the report.
          toolChoice: finishing
            ? "none"
            : closePhase === 1 || (iteration === 0 && wantsChecklist)
              ? checklistTool
              : "auto",
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

    const unfinished = latestTodos.some((todo) => todo.status !== "completed" && todo.status !== "cancelled");
    const hadTask = didWork || latestTodos.length > 0;
    if (!finishing && response.toolCalls.length === 0 && closePhase === 0 && unfinished) {
      messages.push({ role: "assistant", content: finalContent ? finalContent : null });
      messages.push({
        role: "user",
        content:
          "The checklist still has unfinished items. Continue the next pending one now, with the tools. Do not stop to write a report until every item is completed or cancelled.",
      });
      continue;
    }
    if (!finishing && response.toolCalls.length === 0 && closePhase === 0 && hadTask && !looksLikeReport(finalContent)) {
      closePhase = 2;
      messages.push({ role: "assistant", content: finalContent ? finalContent : null });
      messages.push({
        role: "user",
        content:
          "Write a short closing report only. Say what you did, and what you did not do. If nothing is left, say so. Do not list tool names.",
      });
      continue;
    }
    if (!finishing && closePhase === 1 && response.toolCalls.length === 0) {
      closePhase = 2;
      messages.push({ role: "assistant", content: finalContent ? finalContent : null });
      messages.push({
        role: "user",
        content: "Write a short closing report only. Say what you did, and what you did not do. If nothing is left, say so. Do not list tool names.",
      });
      continue;
    }

    if (finishing || response.toolCalls.length === 0) {
      return {
        content: closingText(narrations, finalContent) || "I couldn't finish that turn. Ask me to continue and I'll pick up from here.",
        usage,
        tokensConsumed,
        loadedSkills,
      };
    }

    // Record the assistant turn that requested the tools (required so the model
    // can correlate the tool results we append next).
    messages.push({
      role: "assistant",
      content: finalContent ? finalContent : null,
      tool_calls: response.toolCalls,
    });

    if (response.toolCalls.some((call) => call.function.name !== KODE_TODOS_TOOL)) didWork = true;

    for (const call of response.toolCalls) {
      const hookArgs = parseArgs(call.function.arguments);
      const blockedBy = toolHooks?.before ? await toolHooks.before(call.function.name, hookArgs) : null;
      if (blockedBy) {
        onToolStep({
          id: call.id,
          name: call.function.name,
          args: hookArgs,
          description: describeToolCall(call.function.name, hookArgs),
          state: "rejected",
          result: `Blocked by a plugin hook: ${blockedBy}`,
        });
        messages.push({ role: "tool", tool_call_id: call.id, content: `Blocked by a plugin hook: ${blockedBy}` });
        continue;
      }
      let result = await handleToolCall(call, {
        mode,
        projectRoot,
        chatId,
        extraTools,
        signal,
        onToolStep,
        requestApproval,
        requestOptions,
        onTodos: (todos) => {
          latestTodos = todos;
          onTodos?.(todos);
        },
        skills,
      });
      if (toolHooks?.after) {
        const extra = await toolHooks.after(call.function.name, hookArgs, result);
        if (extra.length) result = `${result}\n\n${extra.join("\n\n")}`;
      }
      if (call.function.name === KODE_LOAD_SKILL_TOOL) {
        const skillName = parseArgs(call.function.arguments).name;
        if (typeof skillName === "string" && findSkill(skills, skillName)) {
          loadedSkills.push(skillName);
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }

    // Keep the plan live: after a stretch of work with no checklist update,
    // remind the model to tick off what it finished (the dock shows it).
    if (response.toolCalls.some((call) => call.function.name === KODE_TODOS_TOOL)) {
      workSinceChecklist = 0;
    } else {
      workSinceChecklist += response.toolCalls.length;
    }
    if (
      closePhase === 0 &&
      workSinceChecklist >= CHECKLIST_NUDGE_AFTER &&
      latestTodos.some((todo) => todo.status === "in_progress")
    ) {
      workSinceChecklist = 0;
      messages.push({
        role: "user",
        content:
          "(Progress check) If you finished the current checklist item, call update_todos now to mark it completed and set the next one in_progress. Then continue.",
      });
    }

    if (closePhase === 1 && response.toolCalls.some((call) => call.function.name === KODE_TODOS_TOOL)) {
      closePhase = 2;
      messages.push({
        role: "user",
        content: "Write a short closing report only. Say what you did, and what you did not do. If nothing is left, say so. Do not list tool names.",
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
      loadedSkills,
      stopped: true,
    };
  }

  return {
    content: closingText(narrations, finalContent) || "I couldn't finish that turn. Ask me to continue and I'll pick up from here.",
    usage,
    tokensConsumed,
    loadedSkills,
  };
}

function looksLikeReport(text: string) {
  const body = text.toLowerCase();
  const did = /\b(did|done|finished|completed|changed|updated|fixed|added|removed)\b/.test(body);
  const left = /\b(not done|didn't|did not|left|remaining|couldn't|could not|nothing left|everything is done|still pending)\b/.test(body);
  return did && left && text.trim().length > 40;
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
    chatId?: string | null;
    onToolStep: (step: KodeToolStep) => void;
    requestApproval: (step: KodeToolStep) => Promise<boolean>;
    requestOptions: (step: KodeToolStep) => Promise<string[]>;
    onTodos?: (todos: KodeTodo[]) => void;
    skills: KodeSkill[];
    extraTools?: KodeExtraTool[];
    signal?: AbortSignal;
  },
): Promise<string> {
  const name = call.function.name;
  const args = parseArgs(call.function.arguments);
  const extra = ctx.extraTools?.find((tool) => tool.definition.function.name === name);
  const step: KodeToolStep = {
    id: call.id,
    name,
    args,
    description: extra ? extra.describe(args) : describeToolCall(name, args),
    state: "running",
  };

  if (extra) {
    if (extra.needsApproval && (ctx.mode === "supervised" || ctx.mode === "ask")) {
      step.state = "pending-approval";
      ctx.onToolStep(step);
      if (!(await ctx.requestApproval(step))) {
        step.state = "rejected";
        step.result = declineMessage(step.id, "The user declined.");
        ctx.onToolStep(step);
        return step.result;
      }
      step.state = "running";
    }
    ctx.onToolStep(step);
    try {
      step.result = await extra.run(args, ctx.signal);
      step.state = "done";
    } catch (error) {
      step.result = `Error: ${error instanceof Error ? error.message : String(error)}`;
      step.state = "error";
    }
    ctx.onToolStep(step);
    return step.result;
  }

  // MCP tools (external servers) — require approval unless in full access, and
  // remember the per-tool allow/deny decision so trusted tools stop nagging.
  const mcp = parseMcpToolName(name);
  if (mcp) {
    const fullName = mcpToolName(mcp.serverId, mcp.toolName);
    const permission = getMcpPermission(fullName);

    if (permission === "deny") {
      step.state = "rejected";
      step.result = "Blocked by a saved permission.";
      ctx.onToolStep(step);
      return step.result;
    }

    if (ctx.mode !== "full_access" && permission !== "allow") {
      step.state = "pending-approval";
      ctx.onToolStep(step);
      const approved = await ctx.requestApproval(step);
      if (!approved) {
        setMcpPermission(fullName, "deny");
        step.state = "rejected";
        step.result = declineMessage(step.id, "The user rejected this action.");
        ctx.onToolStep(step);
        return step.result;
      }
      setMcpPermission(fullName, "allow");
    }

    step.state = "running";
    ctx.onToolStep(step);
    try {
      const result = await callMcpTool(mcp.serverId, mcp.toolName, args);
      step.state = "done";
      step.result = result.content;
      ctx.onToolStep(step);
      return result.isError ? `Error: ${result.content}` : result.content;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      step.state = "error";
      step.result = message;
      ctx.onToolStep(step);
      return `Error: ${message}`;
    }
  }

  // update_todos just records the model's plan for the UI — no fs op, no approval.
  if (name === KODE_TODOS_TOOL) {
    const todos = normalizeTodos(args.todos);
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

  // Skills: read-only, no project needed.
  if (name === KODE_LOAD_SKILL_TOOL) {
    const skill = findSkill(ctx.skills, typeof args.name === "string" ? args.name : "");
    let output: string;
    if (!skill) {
      output = `No skill named "${String(args.name)}". Available: ${ctx.skills.map((s) => s.name).join(", ")}`;
    } else {
      const files = await listSkillFiles(skill, ctx.projectRoot);
      const fileList = files
        .filter((file) => !file.is_dir)
        .map((file) => `- ${file.path}`)
        .join("\n");
      output = `${renderSkill(skill)}${fileList ? `\n\nAvailable files:\n${fileList}` : ""}`;
    }
    step.state = "done";
    step.result = output;
    ctx.onToolStep(step);
    return output;
  }

  // Read a supporting file inside a skill (references, scripts, templates).
  if (name === KODE_READ_SKILL_FILE_TOOL) {
    const skill = findSkill(ctx.skills, typeof args.name === "string" ? args.name : "");
    const rel = typeof args.path === "string" ? args.path : "";
    let output: string;
    if (!skill) {
      output = `No skill named "${String(args.name)}".`;
    } else {
      try {
        output = await readSkillFile(skill, ctx.projectRoot, rel);
      } catch (error) {
        output = `Could not read ${rel}: ${error instanceof Error ? error.message : String(error)}`;
      }
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
      step.result = declineMessage(step.id, "The user rejected this action.");
      ctx.onToolStep(step);
      return step.result;
    }
  }

  step.state = "running";
  ctx.onToolStep(step);
  try {
    const output = await executeFileTool(name, args, ctx.projectRoot, { chatId: ctx.chatId ?? null });
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
