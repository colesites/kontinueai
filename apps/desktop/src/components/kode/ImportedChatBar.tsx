// The strip above an imported chat: where it came from, sync state, and the
// fixes when sync stops (conflicts). Also hosts the hooks that keep the
// import context current: store subscription, cross-device rebuild,
// migration of old imports, and the shared sync dependencies.

import { AlertTriangle, Download, FileJson, GitMerge, Loader2, RefreshCw, Sparkles, Timer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { KODE_MODEL_ID } from "@repo/ai/lib/kode";
import {
  formatActivity,
  getImportContext,
  providerIcon,
  providerLabel,
  readCodingSession,
  readProjectState,
  saveImportContext,
  scanCodingSessions,
  subscribeImportContexts,
  type StoredImportContext,
} from "@/lib/kode-import";
import {
  importSessionAsChat,
  migrateImportContext,
  resolveConflict,
  scheduleImportContinue,
  stripImportDecorations,
  syncImportContext,
  type SyncDeps,
} from "@/lib/kode-import-sync";
import { contextFromRemote, resolveFolderForPath } from "@/lib/kode-import-remote";
import { fetchRemoteContext } from "@/lib/kode-import-cloud";
import { useConvex } from "convex/react";
import { exportMarkdown } from "@/lib/kode-import-files";
import { generateImportSummary } from "@/lib/kode-import-summary";
import { useKodeWorkspace, type KodeChat, type KodeProject } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";

/** Sync dependencies shared by the open chat and the background sync. */
export function useImportSyncDeps(): SyncDeps {
  const { appendImportedMessages, chats } = useKodeWorkspace();
  return useMemo<SyncDeps>(
    () => ({
      append: appendImportedMessages,
      onLimit: (context, hit) =>
        scheduleImportContinue(context, hit, {
          modelId: KODE_MODEL_ID,
          chatTitle: chats.find((chat) => chat.id === context.chatId)?.title ?? null,
        }),
    }),
    [appendImportedMessages, chats],
  );
}

/**
 * The stored import context for a chat, kept current when the background
 * sync or another view changes it. On a device that never saw the import, it
 * is rebuilt from Convex's `importSource` (cross-device project context).
 */
export function useImportContext(
  chatId: string | null,
  chats: KodeChat[],
  projects: KodeProject[],
): StoredImportContext | null {
  const [context, setContext] = useState<StoredImportContext | null>(() => (chatId ? getImportContext(chatId) : null));
  useEffect(() => {
    const read = () => setContext(chatId ? getImportContext(chatId) : null);
    read();
    return subscribeImportContexts(read);
  }, [chatId]);

  const convex = useConvex();
  const source = chatId ? chats.find((chat) => chat.id === chatId)?.importSource : undefined;
  useEffect(() => {
    if (!chatId || !source || getImportContext(chatId)) return;
    let cancelled = false;
    const folder = resolveFolderForPath(source.projectPath, projects);
    void (async () => {
      const remote = await fetchRemoteContext(convex, chatId);
      let sourcePath: string | undefined;
      try {
        const found = await scanCodingSessions(folder?.path ?? null);
        sourcePath = found.find((s) => s.provider === source.provider && s.sessionId === source.sessionId)?.sourcePath;
      } catch {
        // No local transcript: the chat still opens with a minimal context.
      }
      if (cancelled || getImportContext(chatId)) return;
      saveImportContext(contextFromRemote(chatId, source, { projectPath: folder?.path ?? null, sourcePath }, remote));
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, source, projects, convex]);

  return context;
}

type Persisted = { role: string; content: string }[];

export function ImportedChatBar({
  context,
  loadPersisted,
  syncing,
  error,
  onSync,
  chatTitle,
  className,
}: {
  context: StoredImportContext;
  /** Every saved turn of the chat (the view only loads the newest page). */
  loadPersisted: () => Promise<Persisted>;
  syncing: boolean;
  error: string | null;
  onSync: () => void;
  chatTitle: string;
  className?: string;
}) {
  const { importKodeSession, ensureFolder, selectChat } = useKodeWorkspace();
  const deps = useImportSyncDeps();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Migrate imports made before sync fingerprints, from the chat's own turns.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per context, not per history page
  useEffect(() => {
    if (context.version === 2 || !context.sourcePath) return;
    let cancelled = false;
    void (async () => {
      try {
        const persisted = await loadPersisted();
        const session = await readCodingSession(context.provider as never, context.sourcePath!);
        if (cancelled) return;
        const migrated = migrateImportContext(context, session, persisted);
        saveImportContext(
          migrated ?? {
            ...context,
            version: 2,
            autoSync: false,
            conflict: { kind: "diverged", message: "This older import doesn't match its source anymore.", at: Date.now() },
          },
        );
      } catch {
        if (!cancelled) saveImportContext({ ...context, version: 2, conflict: { kind: "missing", message: "The source transcript is no longer on this device.", at: Date.now() } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [context]);

  const update = (next: StoredImportContext) => saveImportContext(next);

  const fix = useCallback(
    async (action: "reanchor" | "after_kode_turns" | "fresh" | "stop") => {
      if (!context.sourcePath && action !== "stop") return;
      setBusy(action);
      setNotice(null);
      try {
        if (action === "stop") {
          update({ ...context, conflict: undefined, autoSync: false });
          return;
        }
        if (action === "after_kode_turns") {
          const next = resolveConflict(context, action, { chatMessageCount: (await loadPersisted()).length });
          update(next);
          await syncImportContext(next, deps);
          return;
        }
        const session = await readCodingSession(context.provider as never, context.sourcePath!);
        if (action === "reanchor") {
          update(resolveConflict(context, action, { session, chatMessageCount: (await loadPersisted()).length }));
          setNotice("Sync point moved. New turns from now on will sync.");
          return;
        }
        let project = null;
        if (context.projectPath) project = await readProjectState(context.projectPath).catch(() => null);
        const chatId = await importSessionAsChat(session, {
          project,
          folderId: project ? ensureFolder(project.root) : null,
          summary: context.summary,
          importChat: importKodeSession,
        });
        update({ ...context, conflict: undefined, autoSync: false });
        selectChat(chatId);
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(null);
      }
    },
    [context, deps, ensureFolder, importKodeSession, loadPersisted, selectChat],
  );

  const summarize = async () => {
    if (!context.sourcePath) return;
    setBusy("summary");
    setNotice(null);
    try {
      const session = await readCodingSession(context.provider as never, context.sourcePath);
      const { summary, ai } = await generateImportSummary(session);
      const next = { ...context, summary, summaryAt: Date.now() };
      update(next);
      await syncImportContext(next, deps); // rebuild the prompt with it
      setNotice(ai ? "Architecture summary added to the context." : "Model unavailable, so a local summary was added.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const exportChat = async (format: "md" | "json") => {
    const turns = (await loadPersisted()).map((m) => ({ role: m.role, content: stripImportDecorations(m.content) }));
    const safe = chatTitle.replace(/[^\w.-]+/g, "-").slice(0, 60) || "chat";
    const path = await save({ defaultPath: `${safe}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (!path) return;
    const text =
      format === "md"
        ? exportMarkdown(chatTitle, turns, [`Source: ${providerLabel(context.provider)}`, `Session: ${context.sessionId}`])
        : JSON.stringify({ format: "kontinue-session", version: 1, session: { provider: "file", sessionId: context.sessionId, title: chatTitle, messages: turns } }, null, 2);
    const root = path.replace(/[\\/][^\\/]*$/, "");
    const name = path.slice(root.length + 1);
    try {
      await invoke("kode_write_file", { root, path: name, content: text });
      setNotice(`Saved ${name}.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const conflict = context.conflict;
  const pill = "flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-caption text-foreground/50 transition-colors kontinue-hover hover:text-foreground/80 disabled:cursor-default disabled:opacity-50";

  return (
    <div className={cn("mx-auto mb-2 w-[min(48rem,calc(100%-3rem))] space-y-1.5", className)}>
      <div className="flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/[0.06] px-3 py-1.5 text-caption text-foreground/60">
        <img src={providerIcon(context.provider)} alt="" className="size-3.5 shrink-0 invert dark:invert-0" />
        <span className="min-w-0 truncate">
          Imported from <span className="font-medium text-foreground/80">{providerLabel(context.provider)}</span>
          {context.lastActivity ? ` · last active ${formatActivity(context.lastActivity)}` : ""}
          {context.projectPath
            ? ` · ${context.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? "project"}`
            : context.projectName
              ? ` · ${context.projectName} (not open here)`
              : " · no project attached"}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {context.redactions > 0 ? <span className="hidden text-foreground/40 md:inline">{context.redactions} redacted</span> : null}
          {context.lastMessageHash && context.sourcePath ? (
            <button
              type="button"
              onClick={() => update({ ...context, autoSync: context.autoSync === false, conflict: context.autoSync === false ? undefined : context.conflict })}
              title="Append new turns from the source automatically, even when this chat isn't open"
              className={pill}
            >
              <span className={cn("size-1.5 rounded-full", context.autoSync === false ? "bg-foreground/25" : "bg-emerald-500")} />
              Auto {context.autoSync === false ? "off" : "on"}
            </button>
          ) : null}
          {context.sourcePath ? (
            <button type="button" onClick={onSync} disabled={syncing} title="Read new turns from the source transcript" className={pill}>
              <RefreshCw className={cn("size-3", syncing && "animate-spin")} />
              {syncing ? "Syncing" : "Sync"}
            </button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={pill} aria-label="More import actions">
                •••
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem disabled={!context.sourcePath || busy === "summary"} onClick={() => void summarize()}>
                <Sparkles className="size-3.5" />
                {context.summary ? "Refresh architecture summary" : "Add architecture summary"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => update({ ...context, autoContinue: context.autoContinue === false })}>
                <Timer className="size-3.5" />
                {context.autoContinue === false ? "Auto-continue after limits: off" : "Auto-continue after limits: on"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportChat("md")}>
                <Download className="size-3.5" />
                Export as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportChat("json")}>
                <FileJson className="size-3.5" />
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {conflict ? (
        <div className="kontinue-3d flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-label">
          <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1 text-foreground/75">
            <span className="font-medium text-foreground">Sync paused.</span> {conflict.message}
          </span>
          {conflict.kind === "chat_changed" ? (
            <ConflictButton busy={busy === "after_kode_turns"} onClick={() => void fix("after_kode_turns")} icon={<GitMerge className="size-3" />}>
              Add new turns after mine
            </ConflictButton>
          ) : null}
          {conflict.kind !== "missing" ? (
            <>
              <ConflictButton busy={busy === "reanchor"} onClick={() => void fix("reanchor")}>Sync from now on</ConflictButton>
              <ConflictButton busy={busy === "fresh"} onClick={() => void fix("fresh")}>Import a fresh copy</ConflictButton>
            </>
          ) : null}
          <ConflictButton busy={false} onClick={() => void fix("stop")}>Stop syncing</ConflictButton>
        </div>
      ) : null}

      {error || notice ? <p className={cn("px-3 text-caption", error ? "text-amber-500" : "text-muted-foreground")}>{error ?? notice}</p> : null}
    </div>
  );
}

function ConflictButton({ busy, onClick, icon, children }: { busy: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="kontinue-3d flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-caption text-foreground/80 hover:text-foreground disabled:cursor-default disabled:opacity-60">
      {busy ? <Loader2 className="size-3 animate-spin" /> : icon}
      {children}
    </button>
  );
}
