import { ArrowDownToLine, ArrowLeft, Camera, Eye, Check, ChevronDown, ChevronRight, FileUp, Folder, Gauge, Loader2, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildContinuationBundle, type CodingSession, type CodingSessionSummary, type ContinuationBundle, detectSessionSources, findImportBySession, formatActivity, limitLabel, nativeCliKind, type NativeContinue, providerIcon, providerLabel, readCodingSession, readProjectState, scanCodingSessions, sortCodingSessions, type SessionSource, type StoredImportContext } from "@/lib/kode-import";
import { importSessionAsChat, syncImportContext } from "@/lib/kode-import-sync";
import { applyReview, findRedactions } from "@/lib/kode-import-review";
import { parseTranscriptFile } from "@/lib/kode-import-files";
import { generateImportSummary } from "@/lib/kode-import-summary";
import { useImportSyncDeps } from "@/components/kode/ImportedChatBar";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { SnapshotDialog } from "@/components/kode/SnapshotDialog";
import { cn } from "@/lib/utils";

type KodeSessionImportProps = {
  /** Absolute path of the project currently selected in the Kode sidebar. */
  projectPath: string | null;
  projectName: string | null;
};

type ProjectOption = {
  path: string;
  name: string;
  role: "root" | "current" | "session";
};

function normalizePath(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

function samePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

function isAncestor(parent: string, child: string): boolean {
  const p = normalizePath(parent);
  const c = normalizePath(child);
  return c === p || c.startsWith(`${p}/`) || c.startsWith(`${p}\\`);
}

function buildProjectOptions(currentPath: string | null, currentName: string | null, sessionCwd: string | null, sessionRoot: string | null): ProjectOption[] {
  const options: ProjectOption[] = [];
  const add = (path: string | null, name: string | null, role: ProjectOption["role"]) => {
    if (!path) return;
    if (options.some((option) => samePath(option.path, path))) return;
    options.push({ path, name: name ?? baseName(path), role });
  };

  // If the user is already viewing a project above the session folder (e.g.
  // the monorepo root), that is the best target. Otherwise prefer the resolved
  // repository/workspace root over the subfolder Claude/Codex was run in.
  const currentIsBroader = currentPath && sessionCwd && isAncestor(currentPath, sessionCwd) && !samePath(currentPath, sessionCwd);

  if (currentIsBroader) add(currentPath, currentName, "current");
  add(sessionRoot, sessionRoot ? baseName(sessionRoot) : null, "root");
  add(currentPath, currentName, "current");
  add(sessionCwd, sessionCwd ? baseName(sessionCwd) : null, "session");

  return options;
}

function displayTitle(title: string) {
  const clean = title
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean || "Untitled session";
}

function projectRoleLabel(option: ProjectOption): string {
  if (option.role === "current") return "Current project";
  if (option.role === "session") return "Session folder";
  return "Repository root";
}

/**
 * "Import session" pill for the Kode hero. Opens a picker of local Claude Code
 * / Codex sessions, then a short confirm step that imports the transcript as a
 * Kode chat with a continuation context bundle.
 */
export default function KodeSessionImport({ projectPath, projectName }: KodeSessionImportProps) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(false);
  const { projects } = useKodeWorkspace();

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setSnapshot(true)} title="Capture the screen and its accessibility tree into a new thread" className="liquid-glass-pill inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-zinc-700 hover:text-purple-700 dark:text-zinc-200 dark:hover:text-white">
        <Camera size={13} className="shrink-0 text-purple-500" />
        <span>Snapshot</span>
      </button>
      {snapshot ? <SnapshotDialog projectId={projects.find((p) => p.path === projectPath)?.id ?? null} projectPath={projectPath} onClose={() => setSnapshot(false)} /> : null}
      <button type="button" onClick={() => setOpen(true)} className="liquid-glass-pill inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-zinc-700 hover:text-purple-700 dark:text-zinc-200 dark:hover:text-white">
        <ArrowDownToLine size={13} className="shrink-0 text-purple-500" />
        <span>Import session</span>
      </button>

      {open ? <ImportSessionModal projectPath={projectPath} projectName={projectName} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

export function ImportSessionModal({ projectPath, projectName, onClose }: KodeSessionImportProps & { onClose: () => void }) {
  const { ensureFolder, importKodeSession, folders, kodeChats, selectChat } = useKodeWorkspace();
  const syncDeps = useImportSyncDeps();
  const [sources, setSources] = useState<SessionSource[]>([]);
  const [hooks, setHooks] = useState<{ claude: boolean; codex: boolean; codexNotifyTaken: boolean } | null>(null);
  const [review, setReview] = useState<{ terms: string; excluded: Set<number> }>({ terms: "", excluded: new Set() });
  const [withSummary, setWithSummary] = useState(false);
  const [duplicate, setDuplicate] = useState<StoredImportContext | { chatId: string; title: string } | null>(null);

  useEffect(() => {
    void detectSessionSources().then(setSources).catch(() => setSources([]));
    void invoke<{ claude: boolean; codex: boolean; codexNotifyTaken: boolean }>("kode_sync_hooks_status").then(setHooks).catch(() => setHooks(null));
  }, []);

  const toggleHooks = async () => {
    try {
      setHooks(await invoke("kode_sync_hooks_set", { enabled: !(hooks?.claude || hooks?.codex) }));
    } catch (error) {
      setActionError(errorText(error, "Could not change the sync hooks."));
    }
  };

  const [sessions, setSessions] = useState<CodingSessionSummary[]>([]);
  const [scanning, setScanning] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanAll, setScanAll] = useState(!projectPath);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<ContinuationBundle | null>(null);
  const [previewSession, setPreviewSession] = useState<CodingSession | null>(null);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [switchingProject, setSwitchingProject] = useState(false);
  const [readingPath, setReadingPath] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [native, setNative] = useState<NativeContinue>("resume");
  const [actionError, setActionError] = useState<string | null>(null);
  const scanSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++scanSequence.current;
    setScanning(true);
    setScanError(null);
    try {
      const found = await scanCodingSessions(scanAll ? null : projectPath, folders.map((folder) => folder.path));
      if (sequence === scanSequence.current) setSessions(found);
      // Codex's app-server knows thread names (and threads outside the default
      // folder); merge them in when it answers.
      void invoke<{ id: string; title: string; cwd: string | null; model: string | null; updatedAt: number | null; path: string | null }[]>("kode_codex_threads", { cwd: scanAll ? null : projectPath, limit: 60 })
        .then((threads) => {
          if (sequence !== scanSequence.current) return;
          setSessions((current) => {
            const next = [...current];
            for (const thread of threads) {
              if (!thread.path) continue;
              const existing = next.find((item) => item.provider === "codex" && (item.sessionId === thread.id || item.sourcePath === thread.path));
              if (existing) {
                if (thread.title) existing.title = thread.title;
                continue;
              }
              next.push({ provider: "codex", sessionId: thread.id, title: thread.title, projectPath: thread.cwd, projectRoot: thread.cwd, projectExists: true, gitBranch: null, model: thread.model, lastActivity: thread.updatedAt, sourcePath: thread.path, sizeBytes: 0 });
            }
            return sortCodingSessions(next);
          });
        })
        .catch(() => {});
    } catch (error) {
      if (sequence === scanSequence.current) {
        setSessions([]);
        setScanError(errorText(error, "Could not read local coding sessions."));
      }
    } finally {
      if (sequence === scanSequence.current) setScanning(false);
    }
  }, [projectPath, scanAll, folders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!preview) searchRef.current?.focus();
  }, [preview]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter((session) => [session.title, session.projectRoot, session.projectPath, session.gitBranch].flatMap((value) => (value ? [value] : [])).some((value) => value.toLowerCase().includes(needle)));
  }, [query, sessions]);

  const backToList = () => {
    if (importing) return;
    setPreview(null);
    setPreviewSession(null);
    setProjectOptions([]);
    setSelectedTarget(null);
    setActionError(null);
    setReview({ terms: "", excluded: new Set() });
    setDuplicate(null);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || importing) return;
      if (preview) backToList();
      else onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const openPreview = async (summary: CodingSessionSummary) => {
    if (readingPath) return;
    setReadingPath(summary.sourcePath);
    setActionError(null);
    try {
      const session = await readCodingSession(summary.provider, summary.sourcePath);
      await showSession(session);
    } catch (error) {
      setActionError(errorText(error, "Could not read this coding session."));
    } finally {
      setReadingPath(null);
    }
  };

  const importFile = async () => {
    setActionError(null);
    const picked = await openDialog({ multiple: false, filters: [{ name: "Transcript", extensions: ["json", "md", "markdown", "txt"] }] });
    if (typeof picked !== "string") return;
    try {
      const root = picked.replace(/[\\/][^\\/]*$/, "");
      const text = await invoke<string>("kode_read_file", { root, path: picked.slice(root.length + 1) });
      await showSession(parseTranscriptFile(text, picked.slice(root.length + 1)));
    } catch (error) {
      setActionError(errorText(error, "Could not read this file."));
    }
  };

  const showSession = async (session: CodingSession) => {
    {
      // Same session imported before? Offer to open or sync it instead.
      const stored = findImportBySession(session.provider, session.sessionId, session.sourcePath);
      const remote = kodeChats.find((chat) => chat.importSource?.provider === session.provider && chat.importSource.sessionId === session.sessionId);
      setDuplicate(stored && kodeChats.some((chat) => chat.id === stored.chatId) ? stored : remote ? { chatId: remote.id, title: remote.title } : null);
      // The selected Kode project is the default target, because that is what
      // the user is looking at. The session's own folders stay selectable.
      const options = buildProjectOptions(projectPath, projectName, session.projectPath, session.projectRoot);
      const initial = options[0]?.path ?? null;
      let project = null;
      if (initial) {
        try {
          project = await readProjectState(initial);
        } catch {
          // The folder may have moved or been deleted since the session ended.
          project = null;
        }
      }
      setPreviewSession(session);
      setProjectOptions(options);
      setSelectedTarget(project ? initial : null);
      setPreview(buildContinuationBundle(session, project));
    }
  };

  const openDuplicate = async (sync: boolean) => {
    if (!duplicate) return;
    if (sync && "sourcePath" in duplicate) {
      setImporting(true);
      try {
        await syncImportContext(duplicate, syncDeps);
      } catch (error) {
        setActionError(errorText(error, "Could not sync the existing chat."));
        setImporting(false);
        return;
      }
    }
    selectChat(duplicate.chatId);
    onClose();
  };

  const changeTarget = async (path: string | null) => {
    if (!previewSession) return;
    setSelectedTarget(path);
    setActionError(null);
    if (!path) {
      setPreview(buildContinuationBundle(previewSession, null));
      return;
    }
    setSwitchingProject(true);
    try {
      const project = await readProjectState(path);
      setPreview(buildContinuationBundle(previewSession, project));
    } catch (error) {
      setPreview(buildContinuationBundle(previewSession, null));
      setActionError(errorText(error, "Could not inspect the selected project folder."));
    } finally {
      setSwitchingProject(false);
    }
  };

  const confirmImport = async () => {
    if (!preview || importing) return;
    // What gets uploaded: the user's extra terms scrubbed, excluded turns out.
    const session = applyReview(preview.session, {
      terms: review.terms.split(","),
      excluded: review.excluded,
    });
    if (session.messages.length === 0) {
      setActionError("Every turn is left out, so there is nothing to import.");
      return;
    }
    // Only use a project root we could inspect on disk, so file tools never
    // point at a moved/deleted folder.
    const projectRoot = preview.project?.root ?? null;
    const folderId = projectRoot ? ensureFolder(projectRoot) : null;

    setImporting(true);
    setActionError(null);
    try {
      const summary = withSummary ? (await generateImportSummary(session)).summary : undefined;
      await importSessionAsChat(session, {
        project: preview.project,
        folderId,
        summary,
        native: nativeCliKind(session.provider) ? native : undefined,
        importChat: importKodeSession,
      });
      onClose();
    } catch (error) {
      setActionError(errorText(error, "Could not import this session."));
      setImporting(false);
    }
  };

  return (
    // text-left: rendered inside the home hero, which centers its text.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 text-left backdrop-blur-md animate-in fade-in duration-200 dark:bg-black/70">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!importing) onClose();
        }}
      />
      <div className={cn("liquid-glass-dropdown relative z-10 flex w-full flex-col overflow-hidden text-foreground transition-[max-width] duration-200", preview ? "max-h-[min(820px,90vh)] max-w-[680px]" : "max-h-[min(560px,86vh)] max-w-[520px]")}>
        {preview ? (
          <ConfirmStep native={native} onNativeChange={setNative} duplicate={duplicate} onOpenDuplicate={(sync) => void openDuplicate(sync)} review={review} onReviewChange={setReview} withSummary={withSummary} onSummaryChange={setWithSummary} preview={preview} projectOptions={projectOptions} selectedTarget={selectedTarget} switchingProject={switchingProject} importing={importing} error={actionError} onTargetChange={(path) => void changeTarget(path)} onBack={backToList} onConfirm={() => void confirmImport()} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
              <div>
                <h2 className="text-[14px] font-semibold text-foreground">Import a session</h2>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">Continue work from Claude Code, Codex, Cursor, Gemini CLI, OpenCode or Aider.</p>
              </div>
              <IconButton label="Close" onClick={onClose}>
                <X size={14} />
              </IconButton>
            </div>

            <div className="flex items-center gap-2 px-4 pb-3">
              <div className="kontinue-3d flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full px-3">
                <Search size={13} className="shrink-0 text-muted-foreground" />
                <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions" className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60" />
              </div>
              {projectPath ? (
                <button
                  type="button"
                  onClick={() => setScanAll((current) => !current)}
                  title={scanAll ? `Only show ${projectName ?? "this project"}` : "Show sessions from every project"}
                  className="kontinue-3d flex h-8 max-w-[150px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11.5px] text-foreground/75 hover:text-foreground"
                >
                  <Folder size={12} className="shrink-0 text-purple-500" />
                  <span className="truncate">{scanAll ? "All projects" : (projectName ?? "This project")}</span>
                </button>
              ) : null}
              <IconButton label="Import a JSON or Markdown export" onClick={() => void importFile()} bordered>
                <FileUp size={13} />
              </IconButton>
              <IconButton label="Rescan" onClick={() => void refresh()} disabled={scanning} bordered>
                <RefreshCw size={13} className={cn(scanning && "animate-spin")} />
              </IconButton>
            </div>

            <div className="min-h-[220px] flex-1 overflow-y-auto border-t border-black/[0.06] p-1.5 dark:border-white/[0.06]">
              {scanError ? (
                <EmptyState tone="error">{scanError}</EmptyState>
              ) : scanning && sessions.length === 0 ? (
                <EmptyState>
                  <Loader2 className="mx-auto mb-2 size-4 animate-spin" />
                  Looking for local sessions…
                </EmptyState>
              ) : filtered.length === 0 ? (
                <EmptyState>
                  {query ? "No sessions match your search." : !scanAll && projectPath ? `No sessions for ${projectName ?? "this project"} yet.` : "No local sessions found. Start a Claude Code or Codex session, then rescan."}
                  {!query && !scanAll && projectPath ? (
                    <button type="button" onClick={() => setScanAll(true)} className="mt-2 block w-full cursor-pointer text-purple-500 hover:underline">
                      Show all projects
                    </button>
                  ) : null}
                </EmptyState>
              ) : (
                filtered.map((session) => {
                  const isReading = readingPath === session.sourcePath;
                  const project = baseName(session.projectRoot ?? session.projectPath ?? "") || "Unknown project";
                  const limit = limitLabel(session);
                  return (
                    <button
                      key={`${session.provider}:${session.sourcePath}`}
                      type="button"
                      onClick={() => void openPreview(session)}
                      disabled={Boolean(readingPath) && !isReading}
                      className="group grid w-full cursor-pointer grid-cols-[16px_minmax(0,1fr)_14px] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-black/[0.04] disabled:cursor-wait disabled:opacity-50 dark:hover:bg-white/[0.05]"
                    >
                      <img src={providerIcon(session.provider)} alt="" className="size-4 object-contain invert dark:invert-0" />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium leading-4 text-foreground/90">{displayTitle(session.title)}</p>
                        <p className="truncate text-[11px] leading-4 text-muted-foreground/70">
                          {project} · {formatActivity(session.lastActivity)}
                          {!session.projectExists ? <span className="text-amber-500/80"> · folder missing</span> : null}
                        </p>
                        {limit ? (
                          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[10.5px] leading-4 text-amber-600 dark:text-amber-400">
                            <Gauge className="size-3 shrink-0" />
                            <span className="truncate">{limit}</span>
                          </p>
                        ) : null}
                      </div>
                      {isReading ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground/70" />}
                    </button>
                  );
                })
              )}
            </div>

            {actionError ? <p className="border-t border-black/[0.06] px-4 py-2 text-[11px] text-red-400 dark:border-white/[0.06]">{actionError}</p> : null}

            <div className="flex items-center gap-2 border-t border-black/[0.06] px-4 py-2.5 dark:border-white/[0.06]">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {sources
                  .filter((source) => source.detected && source.provider !== "aider")
                  .map((source) => (
                    <span key={source.provider} title={source.note ?? (source.readable ? "Found on this device" : "Not readable")} className={cn("rounded-full px-2 py-0.5 text-[10px]", source.readable ? "bg-black/[0.04] text-foreground/60 dark:bg-white/[0.06]" : "bg-amber-500/10 text-amber-600 dark:text-amber-400")}>
                      {source.label}
                    </span>
                  ))}
              </div>
              {hooks ? (
                <button type="button" onClick={() => void toggleHooks()} title="Adds Claude Code hooks and a Codex notify command that tell Kontinue when a session changes, so imported chats sync within seconds." className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] text-foreground/55 hover:text-foreground">
                  <span className={cn("size-1.5 rounded-full", hooks.claude || hooks.codex ? "bg-emerald-500" : "bg-foreground/25")} />
                  Live sync hooks {hooks.claude || hooks.codex ? "on" : "off"}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConfirmStep({
  duplicate,
  onOpenDuplicate,
  review,
  onReviewChange,
  withSummary,
  onSummaryChange,
  preview,
  projectOptions,
  selectedTarget,
  switchingProject,
  importing,
  error,
  onTargetChange,
  onBack,
  onConfirm,
  native,
  onNativeChange,
}: {
  native: NativeContinue;
  onNativeChange: (value: NativeContinue) => void;
  duplicate: StoredImportContext | { chatId: string; title: string } | null;
  onOpenDuplicate: (sync: boolean) => void;
  review: { terms: string; excluded: Set<number> };
  onReviewChange: (review: { terms: string; excluded: Set<number> }) => void;
  withSummary: boolean;
  onSummaryChange: (value: boolean) => void;
  preview: ContinuationBundle;
  projectOptions: ProjectOption[];
  selectedTarget: string | null;
  switchingProject: boolean;
  importing: boolean;
  error: string | null;
  onTargetChange: (path: string | null) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const session = preview.session;
  // What the preview shows: the session after the user's review.
  const reviewed = useMemo(() => applyReview(session, { terms: review.terms.split(","), excluded: review.excluded }), [session, review]);
  const selected = projectOptions.find((option) => selectedTarget && samePath(option.path, selectedTarget));

  const meta = [providerLabel(session.provider), `${session.messages.length} messages`, preview.project?.branch, formatActivity(session.lastActivity)].filter(Boolean);

  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <IconButton label="Back" onClick={onBack} disabled={importing}>
          <ArrowLeft size={14} />
        </IconButton>
        <h2 className="text-[14px] font-semibold text-foreground">Import session</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="kontinue-3d flex size-9 shrink-0 items-center justify-center rounded-full">
            <img src={providerIcon(session.provider)} alt="" className="size-4 object-contain invert dark:invert-0" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-foreground">{displayTitle(session.title)}</p>
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{meta.join(" · ")}</p>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11.5px] font-medium text-foreground/70">Continue in</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={importing || switchingProject}>
              <button type="button" className="kontinue-3d flex h-9 w-full cursor-pointer items-center gap-2 rounded-full px-3 text-left disabled:cursor-default disabled:opacity-60">
                <Folder size={13} className="shrink-0 text-purple-500" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                  {selected ? selected.name : "Conversation only"}
                  {selected ? <span className="ml-1.5 text-muted-foreground/70">{projectRoleLabel(selected)}</span> : null}
                </span>
                {switchingProject ? <Loader2 size={13} className="shrink-0 animate-spin text-muted-foreground" /> : <ChevronDown size={13} className="shrink-0 text-muted-foreground" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
              {projectOptions.map((option) => (
                <DropdownMenuItem key={option.path} onClick={() => onTargetChange(option.path)}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{option.name}</p>
                    <p className="truncate text-[10.5px] text-muted-foreground/70">{option.path}</p>
                  </div>
                  {selectedTarget && samePath(option.path, selectedTarget) ? <Check size={13} className="shrink-0" /> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => onTargetChange(null)}>
                <span className="flex-1">Conversation only</span>
                {!selectedTarget ? <Check size={13} className="shrink-0" /> : null}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedTarget && !preview.project && !switchingProject ? <p className="mt-1.5 text-[11px] text-amber-500/80">Folder not found. Only the conversation will be imported.</p> : null}
        </div>

        {duplicate ? (
          <div className="kontinue-3d space-y-2 rounded-2xl px-3 py-2.5">
            <p className="text-[11.5px] text-foreground/80">
              <span className="font-medium text-foreground">Already imported.</span> Open the existing chat to keep one copy; it syncs new turns.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => onOpenDuplicate("sourcePath" in duplicate)} disabled={importing} className="kontinue-3d-primary h-7 cursor-pointer rounded-full px-3 text-[11px] font-medium disabled:opacity-60">
                {"sourcePath" in duplicate ? "Sync and open" : "Open existing"}
              </button>
              <span className="self-center text-[10.5px] text-muted-foreground">or import again below as a separate chat.</span>
            </div>
          </div>
        ) : null}

        <UploadPreview session={reviewed} contextPrompt={preview.contextPrompt} />

        <RedactionReview session={session} review={review} onChange={onReviewChange} disabled={importing} />

        {nativeCliKind(session.provider) ? (
          <NativeChoice provider={session.provider} value={native} onChange={onNativeChange} disabled={importing} />
        ) : null}

        <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-foreground/75">
          <input type="checkbox" checked={withSummary} onChange={(event) => onSummaryChange(event.target.checked)} disabled={importing} className="cursor-pointer accent-purple-500" />
          Add an AI architecture and decisions summary to the context
        </label>

        {session.messagesDropped > 0 ? <p className="text-[11px] text-muted-foreground">{session.messagesDropped} older messages are left out to fit. Recent work is kept.</p> : null}

        {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
      </div>

      <div className="flex items-center gap-3 border-t border-black/[0.06] px-4 py-3 dark:border-white/[0.06]">
        <p className="min-w-0 flex-1 text-[10.5px] leading-snug text-muted-foreground/70">Secrets are removed on this device before upload.</p>
        <button type="button" onClick={onBack} disabled={importing} className="kontinue-3d h-8 shrink-0 cursor-pointer rounded-full px-3.5 text-[12px] text-foreground/80 disabled:opacity-50">
          Back
        </button>
        <button type="button" onClick={onConfirm} disabled={importing || !preview.conversationFound} className="kontinue-3d-primary flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium disabled:cursor-default disabled:opacity-60">
          {importing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Importing…
            </>
          ) : (
            "Import"
          )}
        </button>
      </div>
    </>
  );
}

const NATIVE_OPTIONS: { value: NativeContinue; label: string; hint: (agent: string) => string }[] = [
  { value: "resume", label: "Same session", hint: (agent) => `Kode keeps going in your ${agent} session itself, with its full memory. New turns show up there too.` },
  { value: "fork", label: "Fork", hint: (agent) => `A new ${agent} session branched from this one, with its full memory. The original stays untouched.` },
  { value: "off", label: "Hand off", hint: () => "Kode starts fresh from the imported context, on any model." },
];

function NativeChoice({ provider, value, onChange, disabled }: { provider: string; value: NativeContinue; onChange: (value: NativeContinue) => void; disabled: boolean }) {
  const agent = providerLabel(provider as CodingSessionSummary["provider"]);
  const selected = NATIVE_OPTIONS.find((option) => option.value === value) ?? NATIVE_OPTIONS[0];
  return (
    <div className="space-y-1.5">
      <p className="text-[11.5px] font-medium text-foreground/80">When you continue with {agent}</p>
      <div className="flex flex-wrap gap-1">
        {NATIVE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 cursor-pointer rounded-full px-3 text-[11.5px] transition-colors disabled:cursor-default",
              option.value === value ? "kontinue-menu-active font-medium" : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{selected.hint(agent)}</p>
    </div>
  );
}

function RedactionReview({ session, review, onChange, disabled }: { session: CodingSession; review: { terms: string; excluded: Set<number> }; onChange: (review: { terms: string; excluded: Set<number> }) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => findRedactions(session, review.terms.split(",")), [session, review.terms]);
  const turns = useMemo(() => [...new Set(hits.filter((hit) => hit.messageIndex >= 0).map((hit) => hit.messageIndex))], [hits]);
  const elsewhere = useMemo(() => hits.filter((hit) => hit.messageIndex < 0), [hits]);
  const shownSecrets = hits.filter((hit) => hit.kind === "secret").length;
  // Some redactions sit in older turns or tool output that aren't imported.
  const notShown = Math.max(0, session.redactions - shownSecrets);
  const toggle = (index: number) => {
    const excluded = new Set(review.excluded);
    if (excluded.has(index)) excluded.delete(index);
    else excluded.add(index);
    onChange({ ...review, excluded });
  };
  return (
    <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.07]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[11.5px] text-foreground/75">
        <ShieldCheck size={13} className="shrink-0 text-emerald-500" />
        <span className="flex-1">
          Review redactions
          <span className="ml-1.5 text-muted-foreground/70">
            {session.redactions} secret{session.redactions === 1 ? "" : "s"} removed{review.excluded.size ? ` · ${review.excluded.size} turn${review.excluded.size === 1 ? "" : "s"} left out` : ""}
          </span>
        </span>
        <ChevronDown size={13} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-black/[0.06] px-3 py-2.5 dark:border-white/[0.07]">
          <input
            value={review.terms}
            onChange={(event) => onChange({ ...review, terms: event.target.value })}
            disabled={disabled}
            placeholder="Also hide these words (comma separated): client name, internal URL…"
            className="kontinue-3d h-8 w-full rounded-full bg-transparent px-3 text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {turns.length === 0 && elsewhere.length === 0 ? <p className="text-[11px] text-muted-foreground">No redactions in what gets imported.</p> : null}
            {turns.map((index) => {
              const turnHits = hits.filter((hit) => hit.messageIndex === index);
              const out = review.excluded.has(index);
              return (
                <div key={index} className={cn("flex items-start gap-2 rounded-xl px-2 py-1.5 text-[11px]", out ? "opacity-50" : "bg-black/[0.03] dark:bg-white/[0.04]")}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{turnHits[0].role} turn {index + 1}</p>
                    {turnHits.slice(0, 2).map((hit, i) => (
                      <p key={i} className="truncate font-mono text-[10.5px] text-foreground/70">{hit.snippet}</p>
                    ))}
                  </div>
                  <button type="button" onClick={() => toggle(index)} disabled={disabled} className="shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-[10.5px] text-purple-600 hover:underline dark:text-purple-400">
                    {out ? "Include" : "Leave out"}
                  </button>
                </div>
              );
            })}
            {elsewhere.slice(0, 30).map((hit, i) => (
              <div key={`x-${i}`} className="rounded-xl bg-black/[0.03] px-2 py-1.5 text-[11px] dark:bg-white/[0.04]">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{hit.role}</p>
                <p className="truncate font-mono text-[10.5px] text-foreground/70">{hit.snippet}</p>
              </div>
            ))}
          </div>
          {notShown > 0 ? (
            <p className="text-[10.5px] text-muted-foreground">
              {notShown} more {notShown === 1 ? "was" : "were"} in older turns or tool output that {notShown === 1 ? "isn't" : "aren't"} part of this import.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Exactly what gets uploaded: the turns (after review) and the context text. */
function UploadPreview({ session, contextPrompt }: { session: CodingSession; contextPrompt: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"turns" | "context">("turns");
  const mark = (text: string) =>
    text.split(/(\[REDACTED(?:_SECRET)?\])/).map((part, i) =>
      /^\[REDACTED/.test(part) ? (
        <mark key={i} className="rounded bg-amber-500/20 px-0.5 text-amber-700 dark:text-amber-300">{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  return (
    <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.07]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[11.5px] text-foreground/75">
        <Eye size={13} className="shrink-0 text-purple-500" />
        <span className="flex-1">
          Preview what gets uploaded
          <span className="ml-1.5 text-muted-foreground/70">
            {session.messages.length} turns · {session.toolEvents.filter((e) => e.detail).length} tool calls
          </span>
        </span>
        <ChevronDown size={13} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="border-t border-black/[0.06] dark:border-white/[0.07]">
          <div className="flex gap-1 px-3 pt-2">
            {(["turns", "context"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setTab(value)} className={cn("h-6 cursor-pointer rounded-full px-2.5 text-[10.5px]", tab === value ? "kontinue-menu-active" : "text-muted-foreground hover:text-foreground")}>
                {value === "turns" ? "Conversation" : "Context for the next agent"}
              </button>
            ))}
          </div>
          <div className="max-h-[42vh] overflow-y-auto px-3 py-2">
            {tab === "turns" ? (
              <div className="space-y-1.5">
                {session.messages.map((message, index) => (
                  <div key={index} className="rounded-xl bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.04]">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{message.role}{message.images?.length ? ` · ${message.images.length} image${message.images.length === 1 ? "" : "s"}` : ""}</p>
                    <p className="line-clamp-4 font-mono text-[10.5px] whitespace-pre-wrap text-foreground/75">{mark(message.content.slice(0, 1200))}</p>
                  </div>
                ))}
              </div>
            ) : (
              <pre className="font-mono text-[10.5px] whitespace-pre-wrap text-foreground/75">{mark(contextPrompt)}</pre>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconButton({ label, onClick, disabled, bordered, children }: { label: string; onClick: () => void; disabled?: boolean; bordered?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn("flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-50", bordered ? "kontinue-3d" : "hover:bg-black/[0.05] dark:hover:bg-white/[0.06]")}
    >
      {children}
    </button>
  );
}

function EmptyState({ tone, children }: { tone?: "error"; children: React.ReactNode }) {
  return <div className={cn("px-6 py-14 text-center text-[12px] leading-relaxed", tone === "error" ? "text-red-400" : "text-muted-foreground")}>{children}</div>;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function errorText(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return fallback;
}
