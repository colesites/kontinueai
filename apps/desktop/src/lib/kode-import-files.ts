// JSON / Markdown fallback when a transcript isn't on this device: export a
// session (or a Kode chat) to a file, and import such a file later.
//
// Accepted inputs:
// - Kode's own export (JSON, `format: "kontinue-session"`)
// - A JSON array of {role, content} or {messages: [...]} (most chat exports)
// - Markdown with "## User" / "## Assistant" headings (Kode export, Claude
//   Code `/export`, Windsurf / Cursor "export chat"), or "> user:" style lines.

import { hashMessageContent, type CodingSession, type CodingSessionMessage } from "./kode-import";

export const EXPORT_FORMAT = "kontinue-session";

type Role = CodingSessionMessage["role"];

function normalizeRole(raw: unknown): Role | null {
  const role = String(raw ?? "").toLowerCase().trim();
  if (["user", "human", "you", "me"].includes(role)) return "user";
  if (["assistant", "ai", "model", "gemini", "claude", "codex", "bot", "cascade", "agent"].includes(role)) return "assistant";
  if (["system", "notice", "tool"].includes(role)) return "system";
  return null;
}

function emptySession(name: string, messages: CodingSessionMessage[]): CodingSession {
  const firstUser = messages.find((message) => message.role === "user");
  const timestamps = messages.map((message) => message.timestamp).filter((t): t is number => typeof t === "number");
  return {
    provider: "file",
    sessionId: `file-${hashMessageContent(`${name}\n${messages.map((m) => m.content).join("\n")}`)}`,
    title: (firstUser?.content ?? name).replace(/\s+/g, " ").slice(0, 90) || name,
    projectPath: null,
    projectRoot: null,
    gitBranch: null,
    model: null,
    startedAt: timestamps[0] ?? null,
    lastActivity: timestamps.at(-1) ?? null,
    sourcePath: name,
    messages,
    toolEvents: [],
    filesChanged: [],
    messagesDropped: 0,
    redactions: 0,
    truncated: false,
  };
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => (typeof part === "string" ? part : typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n\n");
  }
  if (value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string") {
    return (value as { text: string }).text;
  }
  return "";
}

function parseJson(text: string, name: string): CodingSession | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data && typeof data === "object" && (data as { format?: string }).format === EXPORT_FORMAT) {
    const session = (data as { session: CodingSession }).session;
    return { ...session, provider: session.provider || "file", sourcePath: name };
  }
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { messages?: unknown[] })?.messages)
      ? (data as { messages: unknown[] }).messages
      : Array.isArray((data as { conversation?: unknown[] })?.conversation)
        ? (data as { conversation: unknown[] }).conversation
        : null;
  if (!list) return null;
  const messages: CodingSessionMessage[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const role = normalizeRole(record.role ?? record.type ?? record.author ?? record.sender);
    const content = contentText(record.content ?? record.text ?? record.message).trim();
    if (!role || !content) continue;
    const at = record.timestamp ?? record.createdAt ?? record.created_at;
    const timestamp = typeof at === "number" ? (at < 1e12 ? at * 1000 : at) : typeof at === "string" ? Date.parse(at) || null : null;
    messages.push({ role, content, timestamp });
  }
  if (messages.length === 0) return null;
  const session = emptySession(name, messages);
  const title = (data as { title?: unknown })?.title;
  if (typeof title === "string" && title.trim()) session.title = title.trim().slice(0, 90);
  return session;
}

const HEADING = /^#{1,4}\s*(?:\*\*)?(user|human|you|assistant|ai|claude|codex|cascade|model|agent|system)(?:\*\*)?\s*:?\s*$/i;
const PREFIX = /^(?:>\s*)?(?:\*\*)?(user|human|you|assistant|ai|claude|cascade|model)(?:\*\*)?\s*:\s?(.*)$/i;

function parseMarkdown(text: string, name: string): CodingSession | null {
  const messages: CodingSessionMessage[] = [];
  let role: Role | null = null;
  let buffer: string[] = [];
  let title: string | null = null;
  let inFence = false;
  const flush = () => {
    const content = buffer.join("\n").trim();
    if (role && content) messages.push({ role, content, timestamp: null });
    buffer = [];
  };
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence) {
      const heading = line.match(HEADING);
      if (heading) {
        flush();
        role = normalizeRole(heading[1]);
        continue;
      }
      const prefixed = line.match(PREFIX);
      if (prefixed && (role === null || buffer.length === 0 || /^\s*$/.test(buffer.at(-1) ?? ""))) {
        flush();
        role = normalizeRole(prefixed[1]);
        buffer.push(prefixed[2]);
        continue;
      }
      if (!title && role === null && /^#\s+/.test(line)) {
        title = line.replace(/^#\s+/, "").trim();
        continue;
      }
    }
    if (role) buffer.push(line);
  }
  flush();
  if (messages.length === 0) return null;
  const session = emptySession(name, messages);
  if (title) session.title = title.slice(0, 90);
  return session;
}

/** Parse an exported transcript. Throws with a readable message on failure. */
export function parseTranscriptFile(text: string, name: string): CodingSession {
  const trimmed = text.trim();
  const session = /^[[{]/.test(trimmed) ? parseJson(trimmed, name) : parseMarkdown(trimmed, name);
  if (!session) {
    throw new Error("No conversation found in this file. Use a JSON export or Markdown with User / Assistant headings.");
  }
  return session;
}

/** Kode's JSON export: lossless, re-importable. */
export function exportSessionJson(session: CodingSession): string {
  const { messages, ...rest } = session;
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      session: { ...rest, messages: messages.map(({ images: _images, ...message }) => message) },
    },
    null,
    2,
  );
}

/** Readable Markdown export (also re-importable). */
export function exportMarkdown(
  title: string,
  messages: { role: string; content: string }[],
  meta: string[] = [],
): string {
  const lines = [`# ${title}`, ""];
  for (const line of meta) lines.push(`- ${line}`);
  if (meta.length) lines.push("");
  for (const message of messages) {
    const label = message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : "System";
    lines.push(`## ${label}`, "", message.content.trim(), "");
  }
  return lines.join("\n");
}
