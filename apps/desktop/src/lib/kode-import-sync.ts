// Keeping imported coding sessions in sync with their source transcripts.
//
// One engine (`syncImportContext`) is used by the open chat (PlanView), the
// app-wide background sync (`useImportBackgroundSync`), Claude Code hook
// events and the MCP checkpoint tool. It also:
// - turns tool calls and screenshots into rich cards in the imported turns,
// - spots a source session that stopped on a usage limit and queues a
//   "continue" for when it resets (kode-schedule),
// - records sync conflicts instead of failing silently, so the chat can offer
//   a fix (re-anchor, append after Kode turns, or import a fresh copy).

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { detectLimit, type LimitHit } from "./kode-limits";
import type { KodeAgentMode } from "./kode-tools";
import { RESET_BUFFER_MS, getScheduledPrompts, schedulePrompt } from "./kode-schedule";
import {
  buildContinuationBundle,
  canSyncProvider,
  diffSessionMessages,
  hashMessageContent,
  listImportContexts,
  readCodingSession,
  readProjectState,
  saveImportContext,
  sessionUpdatedAt,
  SyncConflictError,
  type CodingImage,
  type CodingProjectState,
  type CodingSession,
  type CodingSessionMessage,
  type CodingToolEvent,
  type ImportConflict,
  type StoredImportContext,
  type NativeContinue,
} from "./kode-import";

export const IMPORT_CONTEXT_VERSION = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Rich imported turns: tool cards and images
// ─────────────────────────────────────────────────────────────────────────────

export const TOOL_FENCE = "kode-tool";
export const IMAGE_FENCE = "kode-image";
const MAX_CARDS_CHARS = 12_000;
const MAX_MESSAGE_CHARS = 48_000;

export type ToolCard = {
  name: string;
  summary: string;
  detail?: string;
  output?: string;
  isError?: boolean;
  /** Started but no result came back before the session ended. */
  unknown?: boolean;
};

export type ImageCard = { path: string; mediaType: string; root?: string | null };

function fence(lang: string, payload: unknown): string {
  // JSON never contains a raw newline + ``` sequence, so the fence is safe.
  return `\n\n\`\`\`${lang}\n${JSON.stringify(payload)}\n\`\`\``;
}

/** Remove the cards Kode adds, to compare a persisted turn with its source. */
export function stripImportDecorations(content: string): string {
  return content
    .replace(new RegExp(`\\n*\`\`\`(?:${TOOL_FENCE}|${IMAGE_FENCE})\\n[\\s\\S]*?\\n\`\`\``, "g"), "")
    .trim();
}

/**
 * Tool events that belong after each message: from its timestamp up to the
 * next message's. Events without timestamps go with the last message.
 */
export function groupToolEvents(
  messages: Pick<CodingSessionMessage, "timestamp">[],
  events: CodingToolEvent[],
): CodingToolEvent[][] {
  const groups: CodingToolEvent[][] = messages.map(() => []);
  if (messages.length === 0) return groups;
  for (const event of events) {
    if (!event.detail && event.name !== "tool error") continue;
    if (event.timestamp == null) {
      groups[groups.length - 1].push(event);
      continue;
    }
    let target = -1;
    for (let index = 0; index < messages.length; index += 1) {
      const at = messages[index].timestamp;
      if (at != null && at <= event.timestamp) target = index;
    }
    if (target >= 0) groups[target].push(event);
  }
  return groups;
}

/** The content persisted for one imported turn, with its cards appended. */
export function decorateImportedMessage(
  message: CodingSessionMessage,
  events: CodingToolEvent[],
  images: ImageCard[] = [],
): string {
  let content = message.content;
  let budget = MAX_CARDS_CHARS;
  for (const image of images) {
    content += fence(IMAGE_FENCE, image);
  }
  if (message.role === "assistant" || message.role === "system") {
    for (const event of events) {
      const card: ToolCard = {
        name: event.name,
        summary: event.summary,
        ...(event.detail ? { detail: event.detail } : {}),
        ...(event.output ? { output: event.output } : {}),
        ...(event.isError ? { isError: true } : {}),
        ...(event.id && !event.hasResult && event.name !== "tool error" ? { unknown: true } : {}),
      };
      const block = fence(TOOL_FENCE, card);
      if (block.length > budget) break;
      budget -= block.length;
      content += block;
    }
  }
  return content.length > MAX_MESSAGE_CHARS ? message.content : content;
}

export type SaveImage = (root: string, image: CodingImage, index: number) => Promise<string | null>;

/** Save a pasted screenshot into the project's .kode/attachments folder. */
export const saveImportedImage: SaveImage = async (root, image, index) => {
  const extension = image.mediaType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  try {
    return await invoke<string>("kode_save_attachment", {
      root,
      filename: `imported-screenshot-${index + 1}.${extension}`,
      data: image.data,
    });
  } catch {
    return null;
  }
};

/** Normalized turns → what gets persisted (tool cards, saved images). */
export async function prepareImportedMessages(
  messages: CodingSessionMessage[],
  events: CodingToolEvent[],
  options: { projectRoot: string | null; saveImage?: SaveImage } = { projectRoot: null },
): Promise<{ messages: CodingSessionMessage[]; imagePaths: string[] }> {
  const groups = groupToolEvents(messages, events);
  const imagePaths: string[] = [];
  const save = options.saveImage ?? saveImportedImage;
  const out: CodingSessionMessage[] = [];
  for (const [index, message] of messages.entries()) {
    const cards: ImageCard[] = [];
    if (options.projectRoot) {
      for (const image of message.images ?? []) {
        const path = await save(options.projectRoot, image, imagePaths.length);
        if (path) {
          imagePaths.push(path);
          cards.push({ path, mediaType: image.mediaType, root: options.projectRoot });
        }
      }
    }
    out.push({
      role: message.role,
      timestamp: message.timestamp,
      content: decorateImportedMessage(message, groups[index] ?? [], cards),
    });
  }
  return { messages: out, imagePaths };
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage limits in the source session → auto-continue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A usage-limit hit at the end of the source session (after its last user
 * turn), e.g. Claude Code's "5-hour limit reached ∙ resets 3pm".
 */
export function detectImportedLimit(
  session: Pick<CodingSession, "messages" | "toolEvents">,
  now = Date.now(),
): LimitHit | null {
  const messages = session.messages;
  let lastUser = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      lastUser = index;
      break;
    }
  }
  const tail = messages.slice(lastUser + 1);
  // A real assistant answer after the limit notice means work went on.
  for (let index = tail.length - 1; index >= 0; index -= 1) {
    const message = tail[index];
    const hit = detectLimit(message.content, { now });
    if (hit) return hit;
    if (message.role === "assistant" && message.content.length > 400) return null;
  }
  return null;
}

export const CONTINUE_PROMPT =
  "The previous session stopped on a usage limit. Continue the latest task from where it left off.";

/** Queue a continue for a limit hit, once per reset time. Returns the new context. */
export function scheduleImportContinue(
  context: StoredImportContext,
  hit: LimitHit,
  options: { modelId: string; mode?: KodeAgentMode; chatTitle?: string | null; now?: number },
): StoredImportContext {
  const now = options.now ?? Date.now();
  if (context.autoContinue === false) return context;
  const resetAt = hit.resetAt ?? now + 60 * 60_000;
  if (resetAt + RESET_BUFFER_MS <= now) return context;
  if (context.limitScheduledFor === resetAt) return context;
  const already = getScheduledPrompts().some(
    (item) => item.chatId === context.chatId && item.reason === "limit",
  );
  if (!already) {
    schedulePrompt({
      chatId: context.chatId,
      chatTitle: options.chatTitle ?? null,
      text: CONTINUE_PROMPT,
      modelId: options.modelId,
      mode: options.mode ?? "supervised",
      fireAt: resetAt + RESET_BUFFER_MS,
      reason: "limit",
    });
  }
  return { ...context, limitScheduledFor: resetAt };
}

// ─────────────────────────────────────────────────────────────────────────────
// The sync engine
// ─────────────────────────────────────────────────────────────────────────────

export type SyncDeps = {
  readSession?: (provider: string, path: string) => Promise<CodingSession>;
  readProject?: (root: string) => Promise<CodingProjectState>;
  append: (input: {
    chatId: string;
    expectedMessageCount: number;
    model?: string | null;
    messages: CodingSessionMessage[];
  }) => Promise<number>;
  saveImage?: SaveImage;
  /** Called with a limit hit; returns the context to save (scheduled or not). */
  onLimit?: (context: StoredImportContext, hit: LimitHit) => StoredImportContext;
  now?: () => number;
};

export type SyncOutcome = {
  context: StoredImportContext;
  appended: number;
  conflict: ImportConflict | null;
};

const inFlight = new Set<string>();
const busyChats = new Set<string>();

/** Chats with a turn running in Kode; background sync leaves them alone. */
export function setChatBusy(chatId: string, busy: boolean) {
  if (busy) busyChats.add(chatId);
  else busyChats.delete(chatId);
}

/** True while a sync of this chat is running anywhere in the app. */
export function isSyncing(chatId: string): boolean {
  return inFlight.has(chatId);
}

function conflictFrom(error: unknown, now: number): ImportConflict | null {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof SyncConflictError || /appended safely|Re-import/i.test(message)) {
    return { kind: "diverged", message, at: now };
  }
  if (/out of sync/i.test(message)) {
    return {
      kind: "chat_changed",
      message: "New turns were added in Kode, so the source's new turns can't be appended in order.",
      at: now,
    };
  }
  if (/No such file|not found|Could not open the session/i.test(message)) {
    return { kind: "missing", message: "The source transcript is no longer on this device.", at: now };
  }
  return null;
}

/**
 * Pull new turns from the source transcript into the chat and refresh the
 * continuation context. Saves the result and returns it; a conflict is stored
 * on the context (and auto-sync paused) instead of thrown.
 */
export async function syncImportContext(
  context: StoredImportContext,
  deps: SyncDeps,
): Promise<SyncOutcome> {
  const now = deps.now ?? Date.now;
  if (!context.sourcePath || !canSyncProvider(context.provider)) {
    return { context, appended: 0, conflict: null };
  }
  if (inFlight.has(context.chatId)) return { context, appended: 0, conflict: null };
  inFlight.add(context.chatId);
  try {
    const readSession = deps.readSession ?? ((p: string, path: string) => readCodingSession(p as never, path));
    const session = await readSession(context.provider, context.sourcePath);
    const importedCount = context.syncedMessageCount ?? context.messageCount;
    const diff = context.lastMessageHash
      ? diffSessionMessages(session, importedCount, context.lastMessageHash)
      : null;

    let appended = 0;
    let chatMessageCount = context.chatMessageCount ?? importedCount;
    let imagePaths: string[] = [];
    if (diff && diff.newMessages.length > 0) {
      const prepared = await prepareImportedMessages(diff.newMessages, session.toolEvents, {
        projectRoot: context.projectPath,
        saveImage: deps.saveImage,
      });
      imagePaths = prepared.imagePaths;
      chatMessageCount = await deps.append({
        chatId: context.chatId,
        expectedMessageCount: chatMessageCount,
        model: context.model,
        messages: prepared.messages,
      });
      appended = diff.newMessages.length;
    }

    let project: CodingProjectState | null = null;
    if (context.projectPath) {
      try {
        project = await (deps.readProject ?? readProjectState)(context.projectPath);
      } catch {
        project = null;
      }
    }
    const bundle = buildContinuationBundle(session, project, { summary: context.summary, imagePaths });
    let next: StoredImportContext = {
      ...context,
      version: IMPORT_CONTEXT_VERSION,
      lastActivity: session.lastActivity,
      filesChanged: session.filesChanged,
      redactions: session.redactions,
      contextPrompt: bundle.contextPrompt,
      syncedAt: now(),
      conflict: undefined,
      chatMessageCount,
      ...(diff
        ? {
            messageCount: diff.messageCount,
            syncedMessageCount: diff.messageCount,
            lastMessageHash: diff.lastMessageHash,
          }
        : {}),
    };

    const hit = detectImportedLimit(session, now());
    if (hit && deps.onLimit) next = deps.onLimit(next, hit);

    saveImportContext(next);
    return { context: next, appended, conflict: null };
  } catch (error) {
    const conflict = conflictFrom(error, now());
    if (!conflict) throw error;
    const next: StoredImportContext = { ...context, conflict, autoSync: false };
    saveImportContext(next);
    return { context: next, appended: 0, conflict };
  } finally {
    inFlight.delete(context.chatId);
  }
}

/**
 * Conflict fixes that only move the sync point (no chat writes):
 * - "reanchor": treat the source's current last turn as already imported, so
 *   only turns after it sync from now on.
 * - "after_kode_turns": accept the Kode turns typed since the import; new
 *   source turns are appended after them.
 */
export function resolveConflict(
  context: StoredImportContext,
  action: "reanchor" | "after_kode_turns",
  input: { session?: Pick<CodingSession, "messages">; chatMessageCount?: number },
): StoredImportContext {
  if (action === "reanchor") {
    const last = input.session?.messages.at(-1);
    const count = input.session?.messages.length ?? context.messageCount;
    return {
      ...context,
      conflict: undefined,
      autoSync: true,
      lastMessageHash: last ? hashMessageContent(last.content) : context.lastMessageHash,
      syncedMessageCount: count,
      messageCount: count,
      chatMessageCount: input.chatMessageCount ?? context.chatMessageCount,
    };
  }
  return {
    ...context,
    conflict: undefined,
    autoSync: true,
    chatMessageCount: input.chatMessageCount ?? context.chatMessageCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Migration of imports made by older versions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bring an old import up to date without re-importing: find how many source
 * turns are already in the chat by matching contents in order, then store the
 * fingerprint sync needs. Returns null when the chat doesn't match the source.
 */
export function migrateImportContext(
  context: StoredImportContext,
  session: Pick<CodingSession, "messages" | "sourcePath">,
  persisted: { role: string; content: string }[],
): StoredImportContext | null {
  if (context.lastMessageHash) {
    // Synced imports only need the newer fields.
    return {
      ...context,
      version: IMPORT_CONTEXT_VERSION,
      chatMessageCount: context.chatMessageCount ?? context.syncedMessageCount ?? context.messageCount,
    };
  }
  const source = session.messages;
  let matched = 0;
  for (const turn of persisted) {
    if (matched >= source.length) break;
    const clean = stripImportDecorations(turn.content);
    if (clean === source[matched].content.trim()) {
      matched += 1;
    } else if (matched === 0) {
      continue; // a leading notice the old importer added
    } else {
      break; // turns typed in Kode after the import
    }
  }
  if (matched === 0) return null;
  return {
    ...context,
    version: IMPORT_CONTEXT_VERSION,
    sourcePath: context.sourcePath ?? session.sourcePath,
    syncedMessageCount: matched,
    messageCount: matched,
    lastMessageHash: hashMessageContent(source[matched - 1].content),
    chatMessageCount: persisted.length,
    autoSync: context.autoSync ?? true,
    conflict: undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Background sync for every imported chat (not just the open one)
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 60_000;
const HOOK_EVENTS_POLL_MS = 5_000;

export type HookEvent = {
  event: string;
  sessionId: string | null;
  transcriptPath: string | null;
  cwd: string | null;
  at: number;
};

/** Hook / MCP checkpoint events written by Claude Code and agents. */
export async function readHookEvents(since: number): Promise<HookEvent[]> {
  try {
    return await invoke<HookEvent[]>("kode_import_events", { since });
  } catch {
    return [];
  }
}

/** Contexts a hook event points at (by session id or transcript path). */
export function contextsForEvent(
  contexts: StoredImportContext[],
  event: Pick<HookEvent, "sessionId" | "transcriptPath">,
): StoredImportContext[] {
  return contexts.filter(
    (context) =>
      (event.sessionId && context.sessionId === event.sessionId) ||
      (event.transcriptPath && context.sourcePath === event.transcriptPath),
  );
}

/**
 * Mount once (KodeView). Every minute it stats each auto-synced import and
 * syncs the ones whose transcript changed; hook events trigger a sync within
 * seconds. Skips the chat the user is sending in.
 */
export function useImportBackgroundSync(deps: SyncDeps & { busyChatIds?: () => string[] }) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    let cancelled = false;
    let eventsSince = Date.now();

    const syncOne = async (context: StoredImportContext, force = false) => {
      if (cancelled || !context.sourcePath || context.autoSync === false) return;
      if (!context.lastMessageHash || isSyncing(context.chatId)) return;
      if (busyChats.has(context.chatId) || depsRef.current.busyChatIds?.().includes(context.chatId)) return;
      try {
        if (!force) {
          const updated = await sessionUpdatedAt(context.provider, context.sourcePath);
          if (updated <= (context.syncedAt ?? context.importedAt)) return;
        }
        await syncImportContext(context, depsRef.current);
      } catch {
        // Background errors are non-fatal; the chat's Sync button shows them.
      }
    };

    const pollAll = async () => {
      for (const context of listImportContexts()) await syncOne(context);
    };

    const pollEvents = async () => {
      const events = await readHookEvents(eventsSince);
      if (events.length === 0) return;
      eventsSince = Math.max(eventsSince, ...events.map((event) => event.at + 1));
      const contexts = listImportContexts();
      const seen = new Set<string>();
      for (const event of events) {
        for (const context of contextsForEvent(contexts, event)) {
          if (seen.has(context.chatId)) continue;
          seen.add(context.chatId);
          await syncOne(context, true);
        }
      }
    };

    void pollAll();
    const poll = window.setInterval(() => void pollAll(), POLL_MS);
    const events = window.setInterval(() => void pollEvents(), HOOK_EVENTS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(events);
    };
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Importing a session as a new chat (picker, conflict "fresh copy", files)
// ─────────────────────────────────────────────────────────────────────────────

export type ImportChatInput = {
  title: string;
  provider: string;
  sessionId: string;
  projectPath: string | null;
  lastActivity: number | null;
  model: string | null;
  messages: CodingSessionMessage[];
  folderId: string | null;
};

/**
 * Persist `session` as a Kode chat (with tool cards and screenshots) and store
 * its continuation context. Returns the new chat id.
 */
export async function importSessionAsChat(
  session: CodingSession,
  options: {
    project: CodingProjectState | null;
    folderId: string | null;
    summary?: string;
    /** Continue on the original Claude Code / Codex session (see StoredImportContext.native). */
    native?: NativeContinue;
    importChat: (input: ImportChatInput) => Promise<string>;
    saveImage?: SaveImage;
  },
): Promise<string> {
  const projectRoot = options.project?.root ?? null;
  const prepared = await prepareImportedMessages(session.messages, session.toolEvents, {
    projectRoot,
    saveImage: options.saveImage,
  });
  const chatId = await options.importChat({
    title: session.title || "Imported session",
    provider: session.provider,
    sessionId: session.sessionId,
    projectPath: projectRoot,
    lastActivity: session.lastActivity,
    model: session.model,
    messages: prepared.messages,
    folderId: options.folderId,
  });
  const bundle = buildContinuationBundle(session, options.project, {
    summary: options.summary,
    imagePaths: prepared.imagePaths,
  });
  const syncable = canSyncProvider(session.provider);
  const last = session.messages.at(-1);
  saveImportContext({
    chatId,
    provider: session.provider,
    sessionId: session.sessionId,
    sourcePath: syncable ? session.sourcePath : undefined,
    projectPath: projectRoot,
    projectName: projectRoot ? projectRoot.split(/[\\/]/).filter(Boolean).pop() : undefined,
    sessionCwd: session.projectPath ?? undefined,
    native: options.native,
    importedAt: Date.now(),
    syncedAt: Date.now(),
    syncedMessageCount: session.messages.length,
    chatMessageCount: session.messages.length,
    lastMessageHash: last ? hashMessageContent(last.content) : undefined,
    autoSync: syncable,
    autoContinue: true,
    model: session.model ?? undefined,
    lastActivity: session.lastActivity,
    filesChanged: session.filesChanged,
    messageCount: session.messages.length,
    redactions: session.redactions,
    contextPrompt: bundle.contextPrompt,
    summary: options.summary,
    summaryAt: options.summary ? Date.now() : undefined,
    version: IMPORT_CONTEXT_VERSION,
  });
  return chatId;
}
