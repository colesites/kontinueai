// Plugin hooks, Claude Code style: commands that run on events while Kode
// works, only for plugins whose hooks you allowed (Settings → Customize →
// Plugins). Rust runs them (plugin_run_hook) and checks the command is really
// one of that plugin's hooks.
//
// Events: SessionStart (first message of a chat), UserPromptSubmit,
// PreToolUse, PostToolUse, Stop. Exit code 2, or a "block"/"deny" decision,
// stops the action; stdout or `additionalContext` is passed to the model.

import { invoke } from "@tauri-apps/api/core";
import type { InstalledPlugin } from "./kode-plugins";

export type HookEvent = "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "Stop";

/** Kode tool names → the Claude Code names hook matchers are written for. */
const CLAUDE_TOOL_NAMES: Record<string, string> = {
  read_file: "Read",
  write_file: "Write",
  edit_file: "Edit",
  delete_file: "Bash",
  run_command: "Bash",
  list_dir: "LS",
  load_skill: "Skill",
  read_skill_file: "Read",
  web_search: "WebSearch",
  fetch_url: "WebFetch",
  update_todos: "TodoWrite",
  ask_options: "AskUserQuestion",
};

export function claudeToolName(name: string): string {
  return CLAUDE_TOOL_NAMES[name] ?? name;
}

/** Claude Code matchers: empty or "*" match all; otherwise a regex like "Edit|Write". */
export function hookMatches(matcher: string | undefined, target: string): boolean {
  if (!matcher || matcher === "*") return true;
  try {
    return new RegExp(`^(?:${matcher})$`).test(target);
  } catch {
    return matcher === target;
  }
}

export type HookOutcome = { blocked: string | null; context: string[] };

type HookOutput = { exitCode: number; stdout: string; stderr: string };

/** Read one hook's result the way Claude Code does. */
export function readHookOutput(event: HookEvent, plugin: string, out: HookOutput): HookOutcome {
  if (out.exitCode === 2) {
    return { blocked: out.stderr.trim() || `Blocked by the ${plugin} plugin.`, context: [] };
  }
  if (out.exitCode !== 0) return { blocked: null, context: [] }; // non-blocking failure
  const text = out.stdout.trim();
  if (!text) return { blocked: null, context: [] };
  try {
    const json = JSON.parse(text) as {
      decision?: string;
      reason?: string;
      continue?: boolean;
      stopReason?: string;
      hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string; additionalContext?: string };
    };
    const specific = json.hookSpecificOutput ?? {};
    if (json.continue === false) return { blocked: json.stopReason || `Stopped by the ${plugin} plugin.`, context: [] };
    if (json.decision === "block" || specific.permissionDecision === "deny") {
      return {
        blocked: specific.permissionDecisionReason || json.reason || `Blocked by the ${plugin} plugin.`,
        context: [],
      };
    }
    return { blocked: null, context: specific.additionalContext ? [specific.additionalContext] : [] };
  } catch {
    // Plain stdout is context for prompt/session events only.
    return {
      blocked: null,
      context: event === "SessionStart" || event === "UserPromptSubmit" ? [text] : [],
    };
  }
}

export async function runHooks(
  plugins: InstalledPlugin[],
  event: HookEvent,
  payload: {
    cwd: string;
    sessionId: string;
    toolName?: string;
    toolInput?: unknown;
    toolResponse?: unknown;
    prompt?: string;
  },
): Promise<HookOutcome> {
  const outcome: HookOutcome = { blocked: null, context: [] };
  const target = payload.toolName ? claudeToolName(payload.toolName) : event === "SessionStart" ? "startup" : "";
  for (const plugin of plugins) {
    if (!plugin.enabled || !plugin.hooksAllowed) continue;
    for (const group of plugin.hooks?.[event] ?? []) {
      if (target && !hookMatches(group.matcher, target)) continue;
      for (const hook of group.hooks ?? []) {
        if (hook.type !== "command" || !hook.command) continue;
        try {
          const out = await invoke<HookOutput>("plugin_run_hook", {
            plugin: plugin.name,
            command: hook.command,
            cwd: payload.cwd,
            timeoutSecs: hook.timeout ?? 60,
            input: {
              session_id: payload.sessionId,
              transcript_path: "",
              cwd: payload.cwd,
              hook_event_name: event,
              ...(event === "SessionStart" ? { source: "startup" } : {}),
              ...(payload.prompt !== undefined ? { prompt: payload.prompt } : {}),
              ...(payload.toolName ? { tool_name: target, tool_input: payload.toolInput ?? {} } : {}),
              ...(payload.toolResponse !== undefined ? { tool_response: payload.toolResponse } : {}),
            },
          });
          const result = readHookOutput(event, plugin.name, out);
          outcome.context.push(...result.context);
          if (result.blocked) {
            outcome.blocked = result.blocked;
            return outcome;
          }
        } catch {
          // A hook that can't run doesn't stop Kode.
        }
      }
    }
  }
  return outcome;
}

/** Whether any allowed plugin has hooks for this event (skip the work otherwise). */
export function hasHooks(plugins: InstalledPlugin[], event: HookEvent): boolean {
  return plugins.some((p) => p.enabled && p.hooksAllowed && (p.hooks?.[event]?.length ?? 0) > 0);
}
