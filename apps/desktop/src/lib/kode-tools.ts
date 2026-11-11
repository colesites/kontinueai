import { emitProjectFileChange } from "./project-file-events";
import { invoke } from "@tauri-apps/api/core";
import { envVarsFor } from "@/lib/kode-environments";
import type { KodeToolDefinition } from "./kode-chat";

// Agent permission & execution modes:
//   supervised       – Ask before commands and file changes.
//   auto_edits       – Auto-approve edits, ask before commands.
//   auto             – Supported providers approve routine actions, others still ask.
//   full_access      – Allow commands and edits without prompts.
//   design           – Design-first mode, prioritize visual UI/UX layout and styles.
export type KodeAgentMode =
  | "supervised"
  | "auto_edits"
  | "auto"
  | "full_access"
  | "design"
  | "ask"  // backward-compat alias for supervised
  | "plan"; // read-only: investigate, then propose a plan

export const KODE_AGENT_MODES: {
  id: KodeAgentMode;
  label: string;
  description: string;
  icon: "Lock" | "FileEdit" | "Sparkles" | "Zap" | "Palette" | "ClipboardList";
}[] = [
  {
    id: "plan",
    label: "Plan",
    description: "Explores read-only, then proposes a plan",
    icon: "ClipboardList",
  },
  {
    id: "supervised",
    label: "Supervised",
    description: "Asks before edits and commands",
    icon: "Lock",
  },
  {
    id: "auto_edits",
    label: "Auto-accept edits",
    description: "Edits freely, asks before commands",
    icon: "FileEdit",
  },
  {
    id: "auto",
    label: "Auto",
    description: "Approves routine actions, asks for risky ones",
    icon: "Sparkles",
  },
  {
    id: "full_access",
    label: "Full access",
    description: "Never asks. Use in trusted projects",
    icon: "Zap",
  },
  {
    id: "design",
    label: "Design",
    description: "Focus on UI, layout and visual polish",
    icon: "Palette",
  },
];

export const KODE_FILE_TOOLS = [
  "read_file",
  "list_dir",
  "write_file",
  "edit_file",
  "delete_file",
] as const;
export type KodeFileTool = (typeof KODE_FILE_TOOLS)[number];

export const KODE_SHELL_TOOL = "run_command";
export const KODE_BG_START_TOOL = "start_background_command";
export const KODE_BG_OUTPUT_TOOL = "read_background_output";
export const KODE_BG_LIST_TOOL = "list_background_tasks";
export const KODE_BG_STOP_TOOL = "stop_background_command";
/** Commands that need the same approval rules as run_command. */
function isCommandTool(name: string): boolean {
  return name === KODE_SHELL_TOOL || name === KODE_BG_START_TOOL;
}

/** Tools whose approval depends only on the permission mode (not MCP or
 *  app tools, which keep their own saved permissions). */
export const FILE_AND_SHELL_TOOLS: ReadonlySet<string> = new Set([
  "write_file",
  "edit_file",
  "delete_file",
  KODE_SHELL_TOOL,
  KODE_BG_START_TOOL,
]);

/** Extra instructions for Plan mode (read-only investigation → a plan). */
export const KODE_PLAN_MODE_PROMPT = `PLAN MODE (read-only): Do not create, edit or delete files and do not run commands. Investigate with the read-only tools, ask the user with ask_options when a decision is genuinely theirs, then reply with a concise plan under a "## Plan" heading: numbered steps naming the files you'll change and how you'll verify the result. End by saying the user can approve the plan to start building.`;
// Elicitation tool — the model asks the user to pick option(s). Handled by the
// agent loop (renders an Options card), not executed against the filesystem.
export const KODE_ASK_TOOL = "ask_options";
// Plan/todo tool — the model maintains a task list as it works. Handled by the
// agent loop (renders a Task/Queue list), not executed against the filesystem.
export const KODE_TODOS_TOOL = "update_todos";

export type KodeTodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type KodeTodo = {
  title: string;
  description?: string;
  status: KodeTodoStatus;
};

export function normalizeTodos(raw: unknown): KodeTodo[] {
  if (!Array.isArray(raw)) return [];
  const items: KodeTodo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!title) continue;
    const status =
      record.status === "completed" || record.status === "in_progress" || record.status === "cancelled"
        ? record.status
        : "pending";
    items.push({
      title,
      description: typeof record.description === "string" ? record.description : undefined,
      status,
    });
  }
  return items;
}

// Web tools — look things up online (docs, error messages, APIs).
export const KODE_WEB_SEARCH_TOOL = "web_search";
export const KODE_FETCH_URL_TOOL = "fetch_url";
export const KODE_WEB_TOOLS: ReadonlySet<string> = new Set([KODE_WEB_SEARCH_TOOL, KODE_FETCH_URL_TOOL]);

// Knowledge tool — load a skill's full guidance on demand.
export const KODE_LOAD_SKILL_TOOL = "load_skill";
export const KODE_READ_SKILL_FILE_TOOL = "read_skill_file";

// Tools that only inspect / ask — never need approval and are allowed in any mode.
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "read_file",
  "list_dir",
  KODE_ASK_TOOL,
  KODE_TODOS_TOOL,
  KODE_WEB_SEARCH_TOOL,
  KODE_FETCH_URL_TOOL,
  KODE_LOAD_SKILL_TOOL,
  KODE_READ_SKILL_FILE_TOOL,
  KODE_BG_OUTPUT_TOOL,
  KODE_BG_LIST_TOOL,
  KODE_BG_STOP_TOOL,
]);

/** Long-running commands (dev servers, watchers) that keep running in the background. */
export function buildBackgroundToolDefinitions(): KodeToolDefinition[] {
  const id = { type: "string", description: "The task id from start_background_command or list_background_tasks." };
  return [
    {
      type: "function",
      function: {
        name: KODE_BG_START_TOOL,
        description:
          "Start a long-running command in the background (dev server, watcher, `docker compose up`) and return right away with its first output and port. Use this instead of run_command for anything that doesn't exit on its own. The user sees it under Servers / Background tasks and can stop it. Check on it later with read_background_output.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "A short plain-English summary, e.g. 'Start the web dev server'." },
            command: { type: "string", description: "The full shell command." },
            name: { type: "string", description: "Short label, e.g. 'web'." },
          },
          required: ["summary", "command"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: KODE_BG_OUTPUT_TOOL,
        description: "Read the latest output of a background task (to see errors, or whether a server is ready).",
        parameters: { type: "object", properties: { id }, required: ["id"] },
      },
    },
    {
      type: "function",
      function: {
        name: KODE_BG_LIST_TOOL,
        description: "List this chat's background tasks: running ones (with ports) and finished ones.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: KODE_BG_STOP_TOOL,
        description: "Stop a background task (and everything it started).",
        parameters: { type: "object", properties: { id }, required: ["id"] },
      },
    },
  ];
}

type BgTask = { id: string; command: string; name: string | null; status: string; port: number | null; exitCode: number | null; startedAt: number };

function describeBgTask(task: BgTask): string {
  const where = task.port ? ` · http://localhost:${task.port}` : "";
  return `${task.id} · ${task.name ?? task.command} · ${task.status}${task.exitCode !== null ? ` (exit ${task.exitCode})` : ""}${where}`;
}

/** Tool schemas for loading a skill's full text and reading its files on demand. */
export function buildKnowledgeToolDefinitions(): KodeToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: KODE_LOAD_SKILL_TOOL,
        description:
          "Load the full text of a skill from the SKILLS list in your instructions. Do this before work the skill covers. The result includes the skill's guidance and the list of supporting files it ships.",
        parameters: {
          type: "object",
          properties: { name: { type: "string", description: "Skill name exactly as listed." } },
          required: ["name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: KODE_READ_SKILL_FILE_TOOL,
        description:
          "Read a supporting file inside a loaded skill (a reference doc, script, or template). Use after load_skill when the skill points you at a file.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Skill name exactly as listed." },
            path: { type: "string", description: "Path relative to the skill directory, e.g. 'references/migrations.md'." },
          },
          required: ["name", "path"],
        },
      },
    },
  ];
}

/** Tool schemas for searching the web and reading a page. */
export function buildWebToolDefinitions(): KodeToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: KODE_WEB_SEARCH_TOOL,
        description:
          "Search the web for current information: library docs, API changes, error messages, release notes. Use it when you're unsure about something that may have changed or isn't in the codebase. Returns a summary with source links.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "A specific search query, e.g. 'Next.js 16 proxy.ts middleware'." },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: KODE_FETCH_URL_TOOL,
        description:
          "Read a web page (docs, a GitHub issue, a changelog) as plain text. Use after web_search, or when the user gives a URL.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "Full http(s) URL." },
          },
          required: ["url"],
        },
      },
    },
  ];
}

export function isKnownTool(name: string): name is KodeFileTool {
  return (KODE_FILE_TOOLS as readonly string[]).includes(name);
}

// ─── Shell command risk (used by Auto mode) ─────────────────────────────────
// A command is risky if any part of it (split on && || ; |) is destructive,
// affects things outside the project, needs elevated rights, or pipes a
// download into a shell. Everything else (reads, git status/diff, builds,
// tests, linters, package installs) is routine.
const RISKY_PATTERNS: RegExp[] = [
  /^(sudo|doas)\b/,
  /^rm(dir)?\b/,
  /^(shred|dd|mkfs\S*|diskutil|fdisk)\b/,
  /^(chmod|chown|chgrp)\b/,
  /^(kill|killall|pkill)\b/,
  /^(shutdown|reboot|halt|launchctl)\b/,
  /^git\s+(push|reset\s+--hard|clean\b|rebase|filter-branch|update-ref|reflog\s+expire)/,
  /^git\s+(branch|tag)\s+.*-(d|D)\b/,
  /^git\s+checkout\s+(--|\.)/,
  /^git\s+(restore|stash\s+(drop|clear))\b/,
  /\b(npm|pnpm|yarn|bun)\s+(publish|unpublish|deprecate)\b/,
  /^(vercel|netlify|fly|flyctl|railway|wrangler|firebase|heroku)\b.*\b(deploy|--prod|publish|delete|remove|rm)\b/,
  /^(vercel|wrangler)\s+(--prod|deploy)/,
  /\bconvex\s+(deploy|import|env\s+(set|remove))\b/,
  /^(docker|podman)\s+(rm|rmi|system\s+prune|volume\s+rm|compose\s+down\s+-v)/,
  /^(kubectl|helm|terraform|pulumi)\b.*\b(delete|destroy|apply|uninstall|up)\b/,
  /^(brew|apt|apt-get|yum|dnf|pacman)\s+(uninstall|remove|purge)/,
  /^(curl|wget)\b.*\b(-X\s*(POST|PUT|DELETE|PATCH)|--data|-d\s)/,
  /^(scp|rsync|ssh|sftp)\b/,
  /^(mv|cp)\b.*\s(\/|~)/,
  /^(crontab|security|defaults\s+write)\b/,
];

/** True when Auto mode should still ask before running this command. */
export function isRiskyCommand(command: string): boolean {
  const text = command.trim();
  if (!text) return false;
  // Downloads piped straight into a shell or eval.
  if (/(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|fi)?sh\b/.test(text) || /\beval\b/.test(text)) return true;
  // Redirects that write outside the project (absolute or home paths).
  if (/>{1,2}\s*(\/(?!dev\/null)|~)/.test(text)) return true;
  return text
    .split(/&&|\|\||;|\||\n/)
    .map((part) => part.trim().replace(/^(env\s+)?(\w+=\S+\s+)+/, ""))
    .filter(Boolean)
    .some((part) => RISKY_PATTERNS.some((pattern) => pattern.test(part)));
}

/** Does this tool call require user approval under the active mode? */
export function needsApproval(
  toolName: string,
  mode: KodeAgentMode,
  args: Record<string, unknown> = {},
): boolean {
  if (READ_ONLY_TOOLS.has(toolName)) return false;
  switch (mode) {
    case "plan": // mutations are refused in Plan mode anyway (isToolAllowedInMode)
    case "supervised":
    case "ask":
      // Supervised: ask before all mutations and shell commands
      return true;
    case "auto_edits":
      // Auto-accept edits: writes and edits run freely, ask for shell commands and deletes
      return isCommandTool(toolName) || toolName === "delete_file";
    case "auto":
      // Auto: edits and routine commands run; deletes and risky commands ask.
      if (toolName === "delete_file") return true;
      if (isCommandTool(toolName)) {
        return isRiskyCommand(typeof args.command === "string" ? args.command : "");
      }
      return false;
    case "full_access":
      // Full access: execute commands and edits without any prompts
      return false;
    case "design":
      // Design mode: UI edits and styles run freely, ask before shell commands and deletes
      return isCommandTool(toolName) || toolName === "delete_file";
    default:
      return true;
  }
}

/** In plan mode the agent is read-only; mutation/command tools are refused. */
export function isToolAllowedInMode(
  toolName: string,
  mode: KodeAgentMode,
): boolean {
  if (mode === "plan") return READ_ONLY_TOOLS.has(toolName);
  return true;
}

// Tool schema handed to the model. Paths are always relative to the project root.
export function buildFileToolDefinitions(): KodeToolDefinition[] {
  const pathProp = {
    type: "string",
    description: "Path relative to the project root. No leading slash, no '..'.",
  };
  return [
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read the full text contents of a file in the project.",
        parameters: {
          type: "object",
          properties: { path: pathProp },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_dir",
        description:
          "List the files and folders in a directory. Use '' or '.' for the project root.",
        parameters: {
          type: "object",
          properties: { path: pathProp },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write_file",
        description:
          "Create a new file or overwrite an existing one with the given content. Creates parent directories as needed.",
        parameters: {
          type: "object",
          properties: {
            path: pathProp,
            content: { type: "string", description: "The full file content." },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "edit_file",
        description:
          "Replace an exact string in a file. old_string must match exactly and be unique unless replace_all is true.",
        parameters: {
          type: "object",
          properties: {
            path: pathProp,
            old_string: { type: "string", description: "Exact text to replace." },
            new_string: { type: "string", description: "Replacement text." },
            replace_all: {
              type: "boolean",
              description: "Replace every occurrence (default false).",
            },
          },
          required: ["path", "old_string", "new_string"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_file",
        description: "Delete a file or directory from the project.",
        parameters: {
          type: "object",
          properties: { path: pathProp },
          required: ["path"],
        },
      },
    },
  ];
}

// Shell command tool — lets the agent scaffold stacks and run package managers
// (`bun create`, `npm create vite`, installs, `git init`, tests). Always gated
// behind user approval in the loop.
export function buildShellToolDefinition(): KodeToolDefinition {
  return {
    type: "function",
    function: {
      name: KODE_SHELL_TOOL,
      description:
        "Run a shell command in the project (or a subdirectory). Use for scaffolding (e.g. 'bun create vite my-app', 'npm create next-app'), installing dependencies, git, and running tests. Prefer the user's chosen package manager. The user must approve each command.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description:
              "A short plain-English summary of what this command does, e.g. 'Explore the project structure', 'Install dependencies', 'Run the tests'. This is what the user reads when asked to approve the command, so it must be human and never the raw command.",
          },
          command: {
            type: "string",
            description: "The full shell command to run.",
          },
          cwd: {
            type: "string",
            description:
              "Optional working directory relative to the project root. Defaults to the root.",
          },
        },
        required: ["command"],
      },
    },
  };
}

// Elicitation tool — the model asks the user to choose option(s) before
// proceeding (e.g. design style, tech stack, package manager).
export function buildAskOptionsToolDefinition(): KodeToolDefinition {
  return {
    type: "function",
    function: {
      name: KODE_ASK_TOOL,
      description:
        "Ask the user a question in the composer banner. Use this instead of writing a questionnaire into the message. kind: single (default), multi, text, confirm, or form. For form, pass questions. Prefer kind single or multi with 2-4 options whenever the answer has likely choices (the user can still type their own answer under the options); use kind text only for truly open questions like a name or a URL. Give every option a one-line description of what it means or its trade-off, put the option you recommend first and end its label with \" (recommended)\".",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question to ask." },
          kind: {
            type: "string",
            enum: ["single", "multi", "text", "confirm", "form"],
          },
          options: {
            type: "array",
            description: "Choices for single or multi.",
            items: {
              type: "object",
              properties: {
                value: { type: "string" },
                label: { type: "string" },
                description: { type: "string", description: "One line: what this choice means or its trade-off." },
              },
              required: ["value", "label", "description"],
            },
          },
          multiple: { type: "boolean" },
          allowOther: { type: "boolean", description: "Let the user type their own answer." },
          placeholder: { type: "string" },
          questions: {
            type: "array",
            description: "Several questions answered together.",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                kind: { type: "string" },
                options: { type: "array" },
                allowOther: { type: "boolean" },
              },
              required: ["question"],
            },
          },
        },
        required: ["question"],
      },
    },
  };
}

// Heuristic: does the user's message clearly imply acting on files/the project
// (vs. a pure question)? Used to force the first tool turn so weaker models act
// instead of pasting code into the chat.
export function impliesFileWork(text: string): boolean {
  return /\b(build|create|make|scaffold|set ?up|bootstrap|init|add|install|implement|write|generate|fix|debug|refactor|rename|move|update|change|edit|modify|delete|remove|replace|run|test|configure|wire up)\b/i.test(
    text,
  );
}

// Plan/todo tool — the model keeps a visible checklist of what it's doing.
export function buildTodosToolDefinition(): KodeToolDefinition {
  return {
    type: "function",
    function: {
      name: KODE_TODOS_TOOL,
      description:
        "Replace the visible checklist. On a multi-step task, call this first with the steps you intend to do, exactly one in_progress. Call it again as each step finishes. Before you stop, call it once more: completed for what you finished, cancelled for what you will not do, pending for what is still left.",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            description: "The full current task list, in order.",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short task description." },
                description: { type: "string" },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed", "cancelled"],
                },
              },
              required: ["title", "status"],
            },
          },
        },
        required: ["todos"],
      },
    },
  };
}

export type ToolArgs = Record<string, unknown>;

function str(args: ToolArgs, key: string): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`Missing or invalid "${key}" argument`);
  }
  return value;
}

/**
 * Execute a tool call against the on-disk project `root` via the jailed Rust
 * filesystem commands. Returns a string result that is fed back to the model.
 */
export async function executeFileTool(
  toolName: string,
  args: ToolArgs,
  root: string,
  scope: { chatId: string | null } = { chatId: null },
): Promise<string> {
  switch (toolName) {
    case KODE_BG_START_TOOL: {
      const task = await invoke<BgTask>("kode_bg_start", {
        root,
        command: str(args, "command"),
        name: typeof args.name === "string" ? args.name : null,
        chatId: scope.chatId,
        env: envVarsFor(root),
      });
      // Give it a moment so the first output (and port) can be reported.
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const [latest] = (await invoke<BgTask[]>("kode_bg_list", { chatId: scope.chatId })).filter((t) => t.id === task.id);
      const output = await invoke<string>("kode_bg_output", { id: task.id, maxChars: 3_000 });
      return `Started in the background: ${describeBgTask(latest ?? task)}\n\nFirst output:\n${output.trim() || "(nothing yet)"}`;
    }
    case KODE_BG_OUTPUT_TOOL: {
      const output = await invoke<string>("kode_bg_output", { id: str(args, "id"), maxChars: 8_000 });
      return output.trim() || "(no output yet)";
    }
    case KODE_BG_LIST_TOOL: {
      const tasks = await invoke<BgTask[]>("kode_bg_list", { chatId: scope.chatId });
      return tasks.length ? tasks.map(describeBgTask).join("\n") : "No background tasks in this chat.";
    }
    case KODE_BG_STOP_TOOL:
      await invoke("kode_bg_stop", { id: str(args, "id") });
      return `Stopped ${str(args, "id")}.`;
    case "read_file":
      return await invoke<string>("kode_read_file", {
        root,
        path: str(args, "path"),
      });
    case "list_dir": {
      const entries = await invoke<
        { name: string; path: string; is_dir: boolean }[]
      >("kode_list_dir", { root, path: (args.path as string) ?? "" });
      if (entries.length === 0) return "(empty directory)";
      return entries
        .map((e) => `${e.is_dir ? "[dir] " : "      "}${e.path}`)
        .join("\n");
    }
    case "write_file":
      await invoke("kode_write_file", {
        root,
        path: str(args, "path"),
        content: str(args, "content"),
      });
      emitProjectFileChange({ root, path: str(args, "path"), kind: "write" });
      return `Wrote ${str(args, "path")}`;
    case "edit_file":
      await invoke("kode_edit_file", {
        root,
        path: str(args, "path"),
        oldString: str(args, "old_string"),
        newString: str(args, "new_string"),
        replaceAll: Boolean(args.replace_all),
      });
      emitProjectFileChange({ root, path: str(args, "path"), kind: "write" });
      return `Edited ${str(args, "path")}`;
    case "delete_file":
      await invoke("kode_delete_file", {
        root,
        path: str(args, "path"),
      });
      emitProjectFileChange({ root, path: str(args, "path"), kind: "delete" });
      return `Deleted ${str(args, "path")}`;
    case KODE_SHELL_TOOL: {
      const result = await invoke<{
        stdout: string;
        stderr: string;
        exit_code: number | null;
        success: boolean;
      }>("kode_run_command", {
        root,
        command: str(args, "command"),
        cwd: typeof args.cwd === "string" ? args.cwd : null,
        env: envVarsFor(root),
      });
      const parts = [
        `exit code: ${result.exit_code ?? "unknown"} (${result.success ? "success" : "failure"})`,
      ];
      if (result.stdout.trim()) parts.push(`stdout:\n${result.stdout.trim()}`);
      if (result.stderr.trim()) parts.push(`stderr:\n${result.stderr.trim()}`);
      // Cap what we feed back to the model so huge install logs don't blow context.
      const text = parts.join("\n\n");
      return text.length > 6000 ? `${text.slice(0, 6000)}\n…(truncated)` : text;
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/** Short human-readable summary of a tool call for the UI / confirmation card. */
export function describeToolCall(toolName: string, args: ToolArgs): string {
  const path = typeof args.path === "string" ? args.path : "";
  switch (toolName) {
    case "read_file":
      return `Read ${path}`;
    case "list_dir":
      return `List ${path || "project root"}`;
    case "write_file":
      return `Write ${path}`;
    case "edit_file":
      return `Edit ${path}`;
    case "delete_file":
      return `Delete ${path}`;
    case KODE_SHELL_TOOL: {
      const command = typeof args.command === "string" ? args.command.trim() : "";
      const summary = typeof args.summary === "string" ? args.summary.trim() : "";
      if (summary) return summary;
      return summarizeShellCommand(command) ?? "Run a shell command";
    }
    case KODE_BG_START_TOOL: {
      const summary = typeof args.summary === "string" ? args.summary.trim() : "";
      return summary || `Start in background: ${typeof args.command === "string" ? args.command : ""}`;
    }
    case KODE_BG_OUTPUT_TOOL:
      return "Check background task output";
    case KODE_BG_LIST_TOOL:
      return "List background tasks";
    case KODE_BG_STOP_TOOL:
      return "Stop a background task";
    case KODE_ASK_TOOL:
      return typeof args.question === "string" ? args.question : "Choose an option";
    case KODE_WEB_SEARCH_TOOL:
      return `Search the web: ${typeof args.query === "string" ? args.query : ""}`;
    case KODE_LOAD_SKILL_TOOL:
      return `Load skill: ${typeof args.name === "string" ? args.name : ""}`;
    case KODE_READ_SKILL_FILE_TOOL:
      return `Read skill file: ${typeof args.path === "string" ? args.path : ""}`;
    case KODE_FETCH_URL_TOOL:
      return `Read ${typeof args.url === "string" ? args.url : "a web page"}`;
    default:
      if (toolName.startsWith("mcp__")) {
        const parts = toolName.slice("mcp__".length).split("__");
        return `Call ${parts.slice(1).join(".")} (${parts[0] ?? "MCP"})`;
      }
      return toolName;
  }
}

/** Best-effort plain-English description of a shell command, used only when the
 *  model didn't provide a `summary`. Returns null when nothing obvious matches. */
function summarizeShellCommand(command: string): string | null {
  const first = command.split("\n")[0]?.trim() ?? "";
  if (!first) return null;
  if (/^(echo|printf)\b/.test(first)) return "Print text to the terminal";
  if (/^(find|ls)\b/.test(first) && !/(install|test|build|run|create)/.test(first)) {
    return "List files in the project";
  }
  if (/^git\s+(status|diff|log)\b/.test(first)) return "Check the git status";
  if (/^git\s+(add|commit|push)\b/.test(first)) return "Commit changes to git";
  if (/\b(npm|pnpm|yarn|bun)\s+(install|add|i)\b/.test(first)) return "Install dependencies";
  if (/\b(npm|pnpm|yarn|bun)\s+(test|run\s+test)\b/.test(first)) return "Run the tests";
  if (/\b(npm|pnpm|yarn|bun)\s+build\b/.test(first)) return "Build the project";
  if (/\b(npm|pnpm|yarn|bun)\s+run\b/.test(first)) return "Run a project script";
  if (/^(npx|bunx|pnpm|yarn)\s+create\b/.test(first)) return "Scaffold a new project";
  return null;
}
