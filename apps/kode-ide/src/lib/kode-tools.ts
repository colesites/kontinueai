import { invoke } from "@tauri-apps/api/core";
import type { KodeToolDefinition } from "./kode-chat";

// Agent modes, modeled after Claude Code's permission selector.
//   ask    – always confirm before any write/edit/delete (reads run freely)
//   auto   – auto-approve edits/writes; still confirm destructive deletes
//   plan   – read-only: the agent may read/list and produce a plan, never mutates
//   design – reserved (disabled for now)
export type KodeAgentMode = "ask" | "auto" | "plan" | "design";

export const KODE_AGENT_MODES: {
  id: KodeAgentMode;
  label: string;
  description: string;
  disabled?: boolean;
}[] = [
  { id: "ask", label: "Ask", description: "Confirm before editing files" },
  { id: "auto", label: "Auto", description: "Edit freely, confirm deletes" },
  { id: "plan", label: "Plan", description: "Read-only, propose a plan" },
  {
    id: "design",
    label: "Design",
    description: "Coming soon",
    disabled: true,
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
// Elicitation tool — the model asks the user to pick option(s). Handled by the
// agent loop (renders an Options card), not executed against the filesystem.
export const KODE_ASK_TOOL = "ask_options";
// Plan/todo tool — the model maintains a task list as it works. Handled by the
// agent loop (renders a Task/Queue list), not executed against the filesystem.
export const KODE_TODOS_TOOL = "update_todos";

export type KodeTodoStatus = "pending" | "in_progress" | "completed";
export type KodeTodo = {
  title: string;
  description?: string;
  status: KodeTodoStatus;
};

// Tools that only inspect / ask — never need approval and are allowed in Plan mode.
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "read_file",
  "list_dir",
  KODE_ASK_TOOL,
  KODE_TODOS_TOOL,
]);
// High-risk tools: confirmed even in Auto mode.
const ALWAYS_CONFIRM_TOOLS: ReadonlySet<string> = new Set([
  "delete_file",
  KODE_SHELL_TOOL,
]);

export function isKnownTool(name: string): name is KodeFileTool {
  return (KODE_FILE_TOOLS as readonly string[]).includes(name);
}

/** Does this tool call require user approval under the active mode? */
export function needsApproval(toolName: string, mode: KodeAgentMode): boolean {
  if (READ_ONLY_TOOLS.has(toolName)) return false;
  switch (mode) {
    case "ask":
      return true; // confirm every mutation / command
    case "auto":
      return ALWAYS_CONFIRM_TOOLS.has(toolName); // deletes + shell commands only
    case "plan":
    case "design":
      return true;
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
        "Ask the user to choose from a set of options before continuing. Use this for important unspecified decisions — design style, tech stack, package manager, framework — instead of guessing. The user's selection is returned to you.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The question to ask the user.",
          },
          options: {
            type: "array",
            description: "The choices to present.",
            items: {
              type: "object",
              properties: {
                value: { type: "string" },
                label: { type: "string" },
                description: { type: "string" },
              },
              required: ["value", "label"],
            },
          },
          multiple: {
            type: "boolean",
            description: "Allow selecting more than one option (default false).",
          },
        },
        required: ["question", "options"],
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
        "Maintain a visible task list (plan) for multi-step work. Call it at the start with the planned steps, then call again to update statuses as you progress. Replaces the current list each call.",
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
                  enum: ["pending", "in_progress", "completed"],
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
): Promise<string> {
  switch (toolName) {
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
      return `Wrote ${str(args, "path")}`;
    case "edit_file":
      await invoke("kode_edit_file", {
        root,
        path: str(args, "path"),
        oldString: str(args, "old_string"),
        newString: str(args, "new_string"),
        replaceAll: Boolean(args.replace_all),
      });
      return `Edited ${str(args, "path")}`;
    case "delete_file":
      await invoke("kode_delete_file", {
        root,
        path: str(args, "path"),
      });
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
    case KODE_SHELL_TOOL:
      return `Run: ${typeof args.command === "string" ? args.command : ""}`;
    case KODE_ASK_TOOL:
      return typeof args.question === "string" ? args.question : "Choose an option";
    default:
      return toolName;
  }
}
