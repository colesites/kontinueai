// Built-in slash commands + a combined picker entry list (commands + skills).
// These are prompt presets; selecting one inserts `/name ` into the composer so
// the user can add their own instructions after it, then the send path expands
// it into the model prompt (see expandSlashPrompt).

import { findSkill, renderSkill, type KodeSkill } from "./kode-skills";
import {
  getPlugins,
  getUserCommands,
  pluginCommands,
  renderPluginCommand,
  type PluginSlashCommand,
} from "./kode-plugins";

export type KodeCommand = {
  name: string; // without the leading slash
  description: string;
  prompt: string;
};

export const BUILTIN_COMMANDS: KodeCommand[] = [
  {
    name: "review",
    description: "Review code for bugs, correctness, and quality",
    prompt:
      "Review the relevant code carefully for bugs, correctness, edge cases, security issues, and maintainability. Report concrete problems with file/line references and suggest specific fixes, ordered by severity.",
  },
  {
    name: "test",
    description: "Generate tests for the code",
    prompt:
      "Generate comprehensive tests for the code in question using the project's existing test framework. Cover the main paths, error handling, and edge cases.",
  },
  {
    name: "explain",
    description: "Explain how the code works",
    prompt:
      "Explain how the relevant code works, clearly and concisely: its purpose, key data flow, and any non-obvious behavior or gotchas.",
  },
  {
    name: "fix",
    description: "Find and fix a bug or error",
    prompt:
      "Diagnose and fix the bug or error described. First identify the root cause, then make the minimal change and verify it (add a regression test if practical).",
  },
  {
    name: "refactor",
    description: "Refactor without changing behavior",
    prompt:
      "Refactor the relevant code to be cleaner and more maintainable without changing its behavior. Prefer small, safe changes and explain the rationale.",
  },
  {
    name: "commit",
    description: "Write a commit message for the current changes",
    prompt:
      "Inspect the current git changes (status and diff) and write a concise, conventional commit message describing them.",
  },
  {
    name: "plan",
    description: "Investigate, then propose an implementation plan",
    prompt:
      "Investigate the current state of the code and propose a concrete implementation plan: numbered steps naming the files you'll touch and how you'll verify each step.",
  },
  {
    name: "help",
    description: "Explain what Kode can do",
    prompt:
      "Briefly explain what you can help with in this project, and list the slash commands and installed skills that are available.",
  },
  {
    name: "skills",
    description: "List the installed skills",
    prompt:
      "List the installed skills and summarize what each one is for.",
  },
];

export type SlashSkill = { name: string; description: string; scope?: "user" | "project" };

export type SlashEntry = {
  id: string;
  name: string;
  description: string;
  kind: "command" | "skill" | "connector";
  scope?: "user" | "project";
  /** Connectors: false means picking it opens setup instead of inserting it. */
  connected?: boolean;
  /** Plugin that provides this command, if any. */
  plugin?: string;
};

/** A connector offered in the `/` picker (e.g. `/github`). */
export type SlashConnector = { provider: string; name: string; connected: boolean };

/** Commands (first), installed skills, then connectors, for the slash picker. */
/** `/switch-<account>` command name for an account id ("claude_work" → "switch-claude-work"). */
export function switchCommandName(accountId: string): string {
  return `switch-${accountId.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`;
}

export function slashEntries(
  skills: SlashSkill[],
  connectors: SlashConnector[] = [],
  pluginCmds: PluginSlashCommand[] = [],
  accounts: { id: string; label: string; provider: string }[] = [],
): SlashEntry[] {
  const commands: SlashEntry[] = [
    ...BUILTIN_COMMANDS,
    // Handled by the app, not sent to the model (PlanView.switchAccount).
    // Collects diagnostics and hands them to Claude Code or Codex (PlanView).
    { name: "triage", description: "Something's broken? Diagnose and fix it with Claude Code or Codex", prompt: "" },
    // Always listed: with one account per provider it explains how to add one.
    {
      name: "switch",
      description: accounts.length ? "Switch to the next account of this provider" : "Switch accounts (add a second account in Settings → Providers)",
      prompt: "",
    },
    ...accounts.map((account) => ({
      name: switchCommandName(account.id),
      description: `Use the ${account.label} account (${account.provider})`,
      prompt: "",
    })),
  ].map((command) => ({
    id: `command:${command.name}`,
    name: command.name,
    description: command.description,
    kind: "command",
  }));
  // Plugin commands sit with the built-in ones (a built-in name wins).
  for (const command of pluginCmds) {
    if (commands.some((c) => c.name === command.name)) continue;
    commands.push({
      id: `command:${command.plugin}:${command.name}`,
      name: command.name,
      description: command.description,
      kind: "command",
      scope: undefined,
      plugin: command.plugin,
    });
  }
  const skillEntries: SlashEntry[] = skills.map((skill) => ({
    id: `skill:${skill.name}`,
    name: skill.name,
    description: skill.description,
    kind: "skill",
    scope: skill.scope,
  }));
  const connectorEntries: SlashEntry[] = [...connectors]
    .sort((a, b) => Number(b.connected) - Number(a.connected))
    .map((connector) => ({
      id: `connector:${connector.provider}`,
      name: connector.provider,
      description: connector.connected
        ? `Use ${connector.name} for this message`
        : `Connect ${connector.name}`,
      kind: "connector",
      connected: connector.connected,
    }));
  return [...commands, ...skillEntries, ...connectorEntries];
}

export function findCommand(name: string): KodeCommand | undefined {
  return BUILTIN_COMMANDS.find((command) => command.name === name);
}

/** Match a leading `/name` at the very start of the message. */
export function resolveSlash(text: string): { name: string; rest: string } | null {
  const match = text.match(/^\/([a-z0-9-]+)\b([\s\S]*)$/i);
  if (!match) return null;
  return { name: (match[1] ?? "").toLowerCase(), rest: (match[2] ?? "").trim() };
}

/**
 * Expand a leading `/command` or `/skill-name` into the prompt the model sees.
 * Unknown slash text is returned unchanged (the model can interpret it freely).
 */
export function expandSlashPrompt(text: string, skills: KodeSkill[]): string {
  const resolved = resolveSlash(text);
  if (!resolved) return text;

  const command = findCommand(resolved.name);
  if (command) {
    const tail = resolved.rest || "Apply this to the current task.";
    return `${command.prompt}\n\n${tail}`.trim();
  }

  // Your own commands win over plugin ones, like in Claude Code.
  const own = getUserCommands().find((c) => c.name === resolved.name);
  if (own) return renderPluginCommand(own, resolved.rest);
  const fromPlugin = pluginCommands(getPlugins()).find((c) => c.name === resolved.name);
  if (fromPlugin) return renderPluginCommand(fromPlugin, resolved.rest);

  const skill = findSkill(skills, resolved.name);
  if (skill) {
    const tail = resolved.rest || "Apply this skill to the task at hand.";
    return `Use the skill "${skill.name}" for this task and follow it over generic advice.\n\n${renderSkill(skill)}\n\n---\n\n${tail}`.trim();
  }

  return text;
}
