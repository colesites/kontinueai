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

export type CodingProvider =
  | "claude_code"
  | "codex"
  | "gemini_cli"
  | "cursor"
  | "opencode"
  | "aider"
  | "file";

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
  gemini_cli: {
    label: "Gemini CLI",
    shortLabel: "Gemini",
    description: "Google's terminal coding agent",
    icon: "/kontinueai.svg",
  },
  cursor: {
    label: "Cursor",
    shortLabel: "Cursor",
    description: "Cursor's agent chats",
    icon: "/kontinueai.svg",
  },
  opencode: {
    label: "OpenCode",
    shortLabel: "OpenCode",
    description: "Open-source terminal agent",
    icon: "/kontinueai.svg",
  },
  aider: {
    label: "Aider",
    shortLabel: "Aider",
    description: "Aider chat history in the project",
    icon: "/kontinueai.svg",
  },
  file: {
    label: "Exported transcript",
    shortLabel: "File",
    description: "A JSON or Markdown export",
    icon: "/kontinueai.svg",
  },
};

/** Providers whose transcripts can be re-read later to sync new turns. */
export function canSyncProvider(provider: string): boolean {
  return provider !== "file";
}

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
  /** When the session last hit a usage / rate limit (ms). */
  limitHitAt?: number;
  /** When that limit resets (ms), if the agent gave a time. */
  limitResetsAt?: number;
  /** The agent's own words, e.g. "resets 1:40am (Africa/Lagos)". */
  limitNote?: string;
};

/** Limit hits in this window float to the top of the import list. */
export const LIMIT_RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/** Recent limit hits first (newest hit on top), then by latest activity. Same order as the Rust scan. */
export function sortCodingSessions<T extends Pick<CodingSessionSummary, "lastActivity" | "limitHitAt">>(sessions: T[], now = Date.now()): T[] {
  const key = (s: T): [number, number] =>
    s.limitHitAt && now - s.limitHitAt <= LIMIT_RECENT_MS ? [1, s.limitHitAt] : [0, s.lastActivity ?? 0];
  return sessions.sort((a, b) => {
    const [ra, ta] = key(a);
    const [rb, tb] = key(b);
    return rb - ra || tb - ta;
  });
}

/** "Hit limit 2 hr ago · resets 1:40am" for a session that ran out. */
export function limitLabel(session: Pick<CodingSessionSummary, "limitHitAt" | "limitResetsAt" | "limitNote">, now = Date.now()): string | null {
  if (!session.limitHitAt) return null;
  const parts = [`Hit limit ${formatActivity(session.limitHitAt)}`];
  if (session.limitResetsAt) {
    parts.push(session.limitResetsAt <= now ? "reset now" : `resets ${new Date(session.limitResetsAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`);
  } else if (session.limitNote) {
    parts.push(session.limitNote);
  }
  return parts.join(" · ");
}

export type CodingImage = { mediaType: string; data: string };

export type CodingSessionMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number | null;
  /** Screenshots pasted into this turn (Claude Code), base64. */
  images?: CodingImage[];
};

export type CodingToolEvent = {
  name: string;
  summary: string;
  timestamp: number | null;
  id?: string;
  /** The command, or a diff for edits. */
  detail?: string;
  /** What the tool returned (truncated, redacted). */
  output?: string;
  isError?: boolean;
  /** A result came back. Missing on a call with an id = outcome unknown. */
  hasResult?: boolean;
};

/**
 * Tool calls from the session's last turn that never reported a result: the
 * agent stopped (limit, crash, closed terminal) while they ran. They may have
 * changed files, so the next agent must check before repeating them.
 */
export function unfinishedToolCalls(session: Pick<CodingSession, "messages" | "toolEvents">): CodingToolEvent[] {
  const lastUser = [...session.messages].reverse().find((m) => m.role === "user" && m.timestamp != null);
  const since = lastUser?.timestamp ?? null;
  return session.toolEvents.filter(
    (event) =>
      event.id &&
      !event.hasResult &&
      event.name !== "tool error" &&
      (since === null || event.timestamp == null || event.timestamp >= since),
  );
}

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
  knownRoots: string[] = [],
): Promise<CodingSessionSummary[]> {
  return invoke<CodingSessionSummary[]>("kode_scan_coding_sessions", {
    projectPath: projectPath ?? null,
    knownRoots,
  });
}

export type SessionSource = {
  provider: string;
  label: string;
  detected: boolean;
  readable: boolean;
  note: string | null;
};

/** Which agents have history on this machine, and whether Kode can read it. */
export async function detectSessionSources(): Promise<SessionSource[]> {
  return invoke<SessionSource[]>("kode_detect_session_sources");
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
  if (importedCount < 0) {
    throw new SyncConflictError("Invalid imported message count. Re-import the session.");
  }
  if (importedCount > 0 && !importedLastHash) {
    throw new Error(
      "This import was created before sync support. Re-import the session to enable syncing.",
    );
  }
  const anchor = findSyncAnchor(session, importedCount, importedLastHash);
  if (anchor === null) {
    throw new SyncConflictError(
      "The source transcript changed in a way that cannot be appended safely. Re-import the session.",
    );
  }

  const lastMessage = session.messages[session.messages.length - 1];
  const newMessages = session.messages.slice(anchor);
  return {
    newMessages,
    // Count of turns persisted in the chat after appending, which is the
    // previous count plus what is new (the source may have dropped old turns).
    messageCount: importedCount + newMessages.length,
    lastMessageHash: lastMessage
      ? hashMessageContent(lastMessage.content)
      : importedLastHash ?? "",
  };
}

/** Thrown when imported turns no longer line up with the source transcript. */
export class SyncConflictError extends Error {
  readonly conflict = true;
}

/**
 * Index in `session.messages` where new (not yet imported) turns start, or
 * null when the last imported turn can't be found. Long transcripts drop their
 * oldest turns from the import window, so the index can move; we look for the
 * fingerprint near where it was before falling back to a full search.
 */
export function findSyncAnchor(
  session: Pick<CodingSession, "messages">,
  importedCount: number,
  importedLastHash: string | undefined,
): number | null {
  const messages = session.messages;
  if (importedCount === 0) return 0;
  if (!importedLastHash) return null;
  const expected = importedCount - 1;
  const matches = (index: number) =>
    index >= 0 &&
    index < messages.length &&
    hashMessageContent(messages[index].content) === importedLastHash;
  if (matches(expected)) return expected + 1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (matches(index)) return index + 1;
  }
  return null;
}

export function buildContinuationBundle(
  session: CodingSession,
  project: CodingProjectState | null,
  extras: { summary?: string; imagePaths?: string[] } = {},
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

  if (extras.summary?.trim()) {
    sections.push(
      "",
      "### Architecture and decisions (AI summary of the imported session)",
      extras.summary.trim(),
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

  const unfinished = unfinishedToolCalls(session);
  if (unfinished.length > 0) {
    sections.push(
      "",
      "### Tool calls with an unknown outcome",
      "The previous agent started these in its last turn but stopped before any result came back. They may have run fully, partly or not at all, and may still be running. Check their effects (git status and diffs, generated files, running processes) before deciding whether to run them again. Never repeat one blindly.",
    );
    for (const event of unfinished.slice(-12)) {
      sections.push(`- ${event.name}: ${event.detail?.split("\n")[0]?.slice(0, 200) || event.summary}`);
    }
  }

  if (session.toolEvents.length > 0) {
    sections.push("", "### Recent tool activity from the imported session");
    for (const event of session.toolEvents.slice(-14)) {
      sections.push(`- ${event.name}: ${event.summary}`);
    }
  }

  if (extras.imagePaths && extras.imagePaths.length > 0) {
    sections.push("", "### Screenshots from the imported session (open by path)");
    for (const path of extras.imagePaths.slice(0, 12)) sections.push(`- ${path}`);
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

export type NativeContinue = "resume" | "fork" | "off";

/** Which CLI kind can pick up a session from this provider natively. */
export function nativeCliKind(provider: string): "claude" | "codex" | null {
  if (provider === "claude_code") return "claude";
  if (provider === "codex") return "codex";
  return null;
}

/** How an imported chat continues on its own CLI (Codex resumed natively before this option existed). */
export function nativeContinueOf(context: Pick<StoredImportContext, "provider" | "native"> | null | undefined): NativeContinue {
  if (!context || !nativeCliKind(context.provider)) return "off";
  return context.native ?? (context.provider === "codex" ? "resume" : "off");
}

export type StoredImportContext = {
  chatId: string;
  provider: CodingProvider | string;
  sessionId: string;
  /** Local transcript path, used to refresh/sync the checkpoint later. */
  sourcePath?: string;
  projectPath: string | null;
  /** Folder the original agent ran in (Claude Code resumes a session from there). */
  sessionCwd?: string;
  /**
   * With Claude Code / Codex on the same account: "resume" continues the
   * original session itself, "fork" branches a new one from it, "off" hands
   * the work off like any other model.
   */
  native?: NativeContinue;
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
  /** Turns persisted in the Kode chat (imported + any typed in Kode). */
  chatMessageCount?: number;
  /** Set when sync stopped because the chat and source no longer line up. */
  conflict?: ImportConflict;
  /** Queue "continue" when the source session stopped on a usage limit. */
  autoContinue?: boolean;
  /** Reset time we already queued a continue for (so it's queued once). */
  limitScheduledFor?: number;
  /** The "continue from where it stopped" offer was answered (or dismissed). */
  resumeHandled?: boolean;
  /** AI-written architecture / decision summary, folded into the context. */
  summary?: string;
  summaryAt?: number;
  /** Folder name, so another device can find the same project locally. */
  projectName?: string;
  /** Data format version; older entries are migrated on load. */
  version?: number;
};

export type ImportConflict = {
  /**
   * diverged: the source was rewritten (rewind, /compact, edited file).
   * chat_changed: turns were added in Kode, so appends would interleave.
   * missing: the transcript file is gone.
   */
  kind: "diverged" | "chat_changed" | "missing";
  message: string;
  at: number;
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

const contextListeners = new Set<() => void>();

/** Called whenever any stored import context changes (sync, migration…). */
export function subscribeImportContexts(listener: () => void): () => void {
  contextListeners.add(listener);
  return () => contextListeners.delete(listener);
}

function notifyContexts() {
  for (const listener of contextListeners) listener();
}

export function listImportContexts(): StoredImportContext[] {
  return Object.values(loadStore());
}

export function saveImportContext(context: StoredImportContext) {
  const store = loadStore();
  store[context.chatId] = context;
  saveStore(store);
  notifyContexts();
}

export function removeImportContext(chatId: string) {
  const store = loadStore();
  if (!(chatId in store)) return;
  delete store[chatId];
  saveStore(store);
  notifyContexts();
}

/** An existing import of the same source session, if any (for dedupe). */
export function findImportBySession(
  provider: string,
  sessionId: string,
  sourcePath?: string,
): StoredImportContext | null {
  for (const context of listImportContexts()) {
    if (context.provider !== provider) continue;
    if (context.sessionId === sessionId) return context;
    if (sourcePath && context.sourcePath === sourcePath) return context;
  }
  return null;
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}…`;
}
