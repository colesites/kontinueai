import { invoke } from "@tauri-apps/api/core";

// ─────────────────────────────────────────────────────────────────────────────
// Local coding-session import (Claude Code / OpenAI Codex)
//
// The Tauri layer discovers and parses the on-disk transcripts and returns a
// provider-independent "normalized" session. This module wraps those commands,
// builds the continuation context bundle that gets handed to the Kode agent, and
// keeps the import metadata locally so an imported chat stays grounded in the
// project state captured at import time.
// ─────────────────────────────────────────────────────────────────────────────

export type CodingProvider = "claude_code" | "codex";

export const CODING_PROVIDER_META: Record<
  CodingProvider,
  {
    label: string;
    shortLabel: string;
    description: string;
    icon: string;
  }
> = {
  claude_code: {
    label: "Claude Code",
    shortLabel: "Claude",
    description: "Anthropic's terminal coding agent",
    icon: "/claude-ai.svg",
  },
  codex: {
    label: "OpenAI Codex",
    shortLabel: "Codex",
    description: "OpenAI's coding agent",
    icon: "/openai.svg",
  },
};

export function providerLabel(provider: string): string {
  return (
    CODING_PROVIDER_META[provider as CodingProvider]?.label ??
    "Coding session"
  );
}

export function providerIcon(provider: string): string {
  return (
    CODING_PROVIDER_META[provider as CodingProvider]?.icon ??
    "/kontinueai.svg"
  );
}

export type CodingSessionSummary = {
  provider: CodingProvider;
  sessionId: string;
  title: string;
  projectPath: string | null;
  projectRoot: string | null;
  projectExists: boolean;
  gitBranch: string | null;
  model: string | null;
  lastActivity: number | null;
  sourcePath: string;
  sizeBytes: number;
};

export type CodingSessionMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number | null;
};

export type CodingToolEvent = {
  name: string;
  summary: string;
  timestamp: number | null;
};

export type CodingSession = {
  provider: CodingProvider;
  sessionId: string;
  title: string;
  projectPath: string | null;
  projectRoot: string | null;
  gitBranch: string | null;
  model: string | null;
  startedAt: number | null;
  lastActivity: number | null;
  sourcePath: string;
  messages: CodingSessionMessage[];
  toolEvents: CodingToolEvent[];
  filesChanged: string[];
  messagesDropped: number;
  redactions: number;
  truncated: boolean;
};

export type CodingInstruction = {
  path: string;
  content: string;
  truncated: boolean;
};

export type CodingProjectState = {
  root: string;
  branch: string | null;
  status: string;
  diffStat: string;
  recentCommits: string[];
  changedFiles: string[];
  instructions: CodingInstruction[];
  scripts: string[];
};

export type ContinuationBundle = {
  session: CodingSession;
  project: CodingProjectState | null;
  providerLabel: string;
  contextPrompt: string;
  /** The last user request — surfaced in the confirmation UI as the task. */
  lastTask: string;
  /** Locally derived decisions, issues, and unfinished work. */
  memory: ProjectMemory;
  /** True when the transcript's project folder still exists on this machine. */
  projectFound: boolean;
  conversationFound: boolean;
};

export type ProjectMemory = {
  decisions: string[];
  knownIssues: string[];
  unfinishedWork: string;
  touchedAreas: string[];
};

/** Discover local sessions. Pass a project root to scope the scan. */
export async function scanCodingSessions(
  projectPath?: string | null,
): Promise<CodingSessionSummary[]> {
  return invoke<CodingSessionSummary[]>("kode_scan_coding_sessions", {
    projectPath: projectPath ?? null,
  });
}

/** Read and normalize one transcript (and redact secrets locally). */
export async function readCodingSession(
  provider: CodingProvider,
  sessionPath: string,
): Promise<CodingSession> {
  return invoke<CodingSession>("kode_read_coding_session", {
    provider,
    sessionPath,
  });
}

/** Capture the live repo state for the continuation bundle. */
export async function readProjectState(
  root: string,
): Promise<CodingProjectState> {
  return invoke<CodingProjectState>("kode_project_state", { root });
}

/** Last-modified time of a transcript, used to detect new activity cheaply. */
export async function sessionUpdatedAt(
  provider: CodingProvider | string,
  sessionPath: string,
): Promise<number> {
  return invoke<number>("kode_session_updated_at", {
    provider,
    sessionPath,
  });
}

export function hashMessageContent(text: string): string {
  // FNV-1a, 32-bit — enough to validate an append-only transcript prefix.
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export type SessionSyncDiff = {
  newMessages: CodingSessionMessage[];
  messageCount: number;
  lastMessageHash: string;
};

/**
 * Work out which normalized messages are new since the last import. Requires
 * the stored fingerprint because the parser can change how a turn is split.
 */
export function diffSessionMessages(
  session: CodingSession,
  importedCount: number,
  importedLastHash: string | undefined,
): SessionSyncDiff {
  if (importedCount < 0 || importedCount > session.messages.length) {
    throw new Error(
      "The source transcript now has fewer messages than the imported chat. Re-import the session.",
    );
  }
  if (importedCount > 0) {
    if (!importedLastHash) {
      throw new Error(
        "This import was created before sync support. Re-import the session to enable syncing.",
      );
    }
    const lastImported = session.messages[importedCount - 1];
    if (
      !lastImported ||
      hashMessageContent(lastImported.content) !== importedLastHash
    ) {
      throw new Error(
        "The source transcript changed in a way that cannot be appended safely. Re-import the session.",
      );
    }
  }

  const lastMessage = session.messages[session.messages.length - 1];
  return {
    newMessages: session.messages.slice(importedCount),
    messageCount: session.messages.length,
    lastMessageHash: lastMessage
      ? hashMessageContent(lastMessage.content)
      : "",
  };
}

export function buildContinuationBundle(
  session: CodingSession,
  project: CodingProjectState | null,
): ContinuationBundle {
  const messages = session.messages;
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  const lastTask = lastUserMessage
    ? truncate(lastUserMessage.content, 2_000)
    : session.title;
  const lastUpdate = lastAssistantMessage
    ? truncate(lastAssistantMessage.content, 1_500)
    : "";
  const memory = extractProjectMemory(session, lastTask);

  const sections: string[] = [
    "## CONTINUATION CONTEXT (imported coding session)",
    "",
    `The conversation above was imported from ${providerLabel(session.provider)}. You are continuing that same piece of work inside Kontinue, not starting a new task. Treat the imported turns as prior context: do not re-ask questions that were already answered, and preserve decisions, constraints, and unfinished work from them.`,
    "",
    `- Source: ${providerLabel(session.provider)}`,
    `- Original session: ${session.sessionId}`,
    `- Session title: ${session.title}`,
  ];

  if (session.projectRoot ?? session.projectPath) {
    sections.push(`- Project: ${session.projectRoot ?? session.projectPath}`);
  }
  if (
    session.projectPath &&
    session.projectRoot &&
    session.projectPath !== session.projectRoot
  ) {
    sections.push(`- Session working directory: ${session.projectPath}`);
  }
  if (session.gitBranch) {
    sections.push(`- Branch at capture: ${session.gitBranch}`);
  }
  if (session.model) {
    sections.push(`- Previous model: ${session.model}`);
  }
  if (session.lastActivity) {
    sections.push(
      `- Last activity: ${new Date(session.lastActivity).toISOString()}`,
    );
  }

  sections.push("", "### Latest task in the imported session", lastTask);
  if (lastUpdate) {
    sections.push("", "### Last update from the previous agent", lastUpdate);
  }

  sections.push("", "### Project memory (derived from the imported session)");
  if (memory.decisions.length > 0) {
    sections.push("Decisions and constraints:");
    for (const decision of memory.decisions) {
      sections.push(`- ${decision}`);
    }
  } else {
    sections.push("No explicit decisions or constraints were detected.");
  }
  if (memory.knownIssues.length > 0) {
    sections.push("", "Known issues / failed attempts:");
    for (const issue of memory.knownIssues) {
      sections.push(`- ${issue}`);
    }
  }
  if (memory.touchedAreas.length > 0) {
    sections.push("", "Areas touched:");
    for (const area of memory.touchedAreas) {
      sections.push(`- ${area}`);
    }
  }
  sections.push("", "Unfinished work:", memory.unfinishedWork);

  const touchedFiles = session.filesChanged;
  sections.push("", "### Files the previous session touched");
  if (touchedFiles.length === 0) {
    sections.push("No file edits were detected in the transcript.");
  } else {
    for (const file of touchedFiles.slice(0, 60)) {
      sections.push(`- ${file}`);
    }
    if (touchedFiles.length > 60) {
      sections.push(`- …and ${touchedFiles.length - 60} more`);
    }
  }

  sections.push("", "### Current project state (captured now)");
  if (!project) {
    sections.push(
      "The project folder could not be inspected (it may have moved or been deleted). Ask the user to reopen the project before making file changes.",
    );
  } else {
    sections.push(`- Root: ${project.root}`);
    sections.push(`- Branch: ${project.branch ?? "(detached / not a git repo)"}`);
    sections.push(
      `- Changed files: ${project.changedFiles.length > 0 ? project.changedFiles.length : "none"}`,
    );
    if (project.changedFiles.length > 0) {
      for (const file of project.changedFiles.slice(0, 40)) {
        sections.push(`  - ${file}`);
      }
    }
    if (project.status.trim()) {
      sections.push("", "Git status:", "```", project.status.trim(), "```");
    }
    if (project.diffStat.trim()) {
      sections.push("", "Diff stat:", "```", project.diffStat.trim(), "```");
    }
    if (project.recentCommits.length > 0) {
      sections.push("", "Recent commits:");
      for (const commit of project.recentCommits) {
        sections.push(`- ${commit}`);
      }
    }

    if (project.scripts.length > 0) {
      sections.push("", "Package scripts (how to build / test):");
      for (const script of project.scripts) {
        sections.push(`- ${script}`);
      }
    }

    if (project.instructions.length > 0) {
      sections.push("", "### Project instructions");
      for (const instruction of project.instructions) {
        sections.push(
          "",
          `#### ${instruction.path}${instruction.truncated ? " (truncated)" : ""}`,
          instruction.content.trim(),
        );
      }
    }
  }

  if (session.toolEvents.length > 0) {
    sections.push("", "### Recent tool activity from the imported session");
    for (const event of session.toolEvents.slice(-14)) {
      sections.push(`- ${event.name}: ${event.summary}`);
    }
  }

  if (session.messagesDropped > 0) {
    sections.push(
      "",
      `Note: ${session.messagesDropped} older messages were omitted from the import to fit the context budget. The most recent turns are intact.`,
    );
  }

  sections.push(
    "",
    "### Rules for continuing",
    "- Inspect the current files on disk before editing them; the repository may have changed since this transcript was recorded.",
    "- Continue from the latest task above. Do not restart the project or repeat completed steps.",
    "- Keep earlier architectural decisions and constraints from the imported conversation.",
    "- Ask before destructive actions. Never print or request secrets — credentials were redacted during import.",
  );

  return {
    session,
    project,
    providerLabel: providerLabel(session.provider),
    contextPrompt: sections.join("\n"),
    lastTask,
    memory,
    projectFound: project !== null,
    conversationFound: messages.length > 0,
  };
}

export function extractProjectMemory(
  session: CodingSession,
  lastTask: string,
): ProjectMemory {
  const decisions: string[] = [];
  const seenDecisions = new Set<string>();
  for (const message of session.messages) {
    if (message.role !== "user") continue;
    for (const sentence of splitSentences(message.content)) {
      if (sentence.length < 20 || sentence.length > 320) continue;
      if (sentence.endsWith("?")) continue;
      if (!DECISION_PATTERN.test(sentence)) continue;
      const key = sentence.toLowerCase().replace(/\s+/g, " ").trim();
      if (seenDecisions.has(key)) continue;
      seenDecisions.add(key);
      decisions.push(truncate(sentence, 280));
      if (decisions.length >= 8) break;
    }
    if (decisions.length >= 8) break;
  }

  const knownIssues: string[] = [];
  const seenIssues = new Set<string>();
  const pushIssue = (value: string) => {
    const clean = truncate(value.replace(/\s+/g, " ").trim(), 240);
    if (clean.length < 12) return;
    const key = clean.toLowerCase();
    if (seenIssues.has(key)) return;
    seenIssues.add(key);
    knownIssues.push(clean);
  };

  for (const event of session.toolEvents) {
    if (ISSUE_PATTERN.test(`${event.name} ${event.summary}`)) {
      pushIssue(`${event.name}: ${event.summary}`);
    }
    if (knownIssues.length >= 6) break;
  }
  if (knownIssues.length < 6) {
    for (const message of [...session.messages].reverse()) {
      if (message.role !== "assistant") continue;
      for (const sentence of splitSentences(message.content)) {
        if (ISSUE_PATTERN.test(sentence)) pushIssue(sentence);
        if (knownIssues.length >= 6) break;
      }
      if (knownIssues.length >= 6) break;
    }
  }

  const areas = new Set<string>();
  for (const file of session.filesChanged) {
    const normalized = file.replace(/\\/g, "/").replace(/^\.\//, "");
    if (normalized.startsWith("node_modules/")) continue;
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    areas.add(parts.slice(0, Math.min(2, parts.length)).join("/"));
  }

  return {
    decisions,
    knownIssues,
    unfinishedWork: truncate(lastTask, 600),
    touchedAreas: [...areas].slice(0, 8),
  };
}

const DECISION_PATTERN =
  /^(?:use|prefer|don't|do not|never|always|keep|preserve|avoid|make sure)\b|\b(?:we decided|decision|constraint|must|switch to|migrate to|required?)\b/i;
const ISSUE_PATTERN =
  /\b(?:error|failed|failing|exception|crash|broken|timeout|doesn't work|does not work|bug)\b/i;

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatActivity(timestamp: number | null): string {
  if (!timestamp) return "unknown";
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hr ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`;
  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Locally stored continuation context, keyed by Kode chat id.
// ─────────────────────────────────────────────────────────────────────────────

const IMPORT_CONTEXT_KEY = "kontinue:kode-import-context:v1";

export type StoredImportContext = {
  chatId: string;
  provider: CodingProvider | string;
  sessionId: string;
  /** Local transcript path, used to refresh/sync the checkpoint later. */
  sourcePath?: string;
  projectPath: string | null;
  importedAt: number;
  /** Last time the context bundle was re-read from disk. */
  syncedAt?: number;
  /** Number of normalized messages persisted in the Kode chat. */
  syncedMessageCount?: number;
  /** Fingerprint of the last imported message, to validate append-only sync. */
  lastMessageHash?: string;
  /** Keep polling the source transcript for new turns while the chat is open. */
  autoSync?: boolean;
  model?: string;
  lastActivity: number | null;
  filesChanged: string[];
  messageCount: number;
  redactions: number;
  contextPrompt: string;
};

type ImportContextStore = Record<string, StoredImportContext>;

function loadStore(): ImportContextStore {
  try {
    const raw = window.localStorage.getItem(IMPORT_CONTEXT_KEY);
    return raw ? (JSON.parse(raw) as ImportContextStore) : {};
  } catch {
    return {};
  }
}

function saveStore(store: ImportContextStore) {
  try {
    window.localStorage.setItem(IMPORT_CONTEXT_KEY, JSON.stringify(store));
  } catch {
    // Local storage may be unavailable/full — the chat still works without it.
  }
}

export function getImportContext(
  chatId: string,
): StoredImportContext | null {
  return loadStore()[chatId] ?? null;
}

export function saveImportContext(context: StoredImportContext) {
  const store = loadStore();
  store[context.chatId] = context;
  saveStore(store);
}

export function removeImportContext(chatId: string) {
  const store = loadStore();
  if (!(chatId in store)) return;
  delete store[chatId];
  saveStore(store);
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}…`;
}
