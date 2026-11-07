import { ArrowDownToLine, ArrowLeft, Check, ChevronDown, ChevronRight, Folder, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildContinuationBundle, type CodingSession, type CodingSessionSummary, type ContinuationBundle, formatActivity, hashMessageContent, providerIcon, providerLabel, readCodingSession, readProjectState, saveImportContext, scanCodingSessions } from "@/lib/kode-import";
import { useKodeWorkspace } from "@/lib/kode-workspace";
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

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="liquid-glass-pill inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-zinc-700 hover:text-purple-700 dark:text-zinc-200 dark:hover:text-white">
        <ArrowDownToLine size={13} className="shrink-0 text-purple-500" />
        <span>Import session</span>
      </button>

      {open ? <ImportSessionModal projectPath={projectPath} projectName={projectName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ImportSessionModal({ projectPath, projectName, onClose }: KodeSessionImportProps & { onClose: () => void }) {
  const { ensureFolder, importKodeSession } = useKodeWorkspace();

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
  const [actionError, setActionError] = useState<string | null>(null);
  const scanSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++scanSequence.current;
    setScanning(true);
    setScanError(null);
    try {
      const found = await scanCodingSessions(scanAll ? null : projectPath);
      if (sequence === scanSequence.current) setSessions(found);
    } catch (error) {
      if (sequence === scanSequence.current) {
        setSessions([]);
        setScanError(errorText(error, "Could not read local coding sessions."));
      }
    } finally {
      if (sequence === scanSequence.current) setScanning(false);
    }
  }, [projectPath, scanAll]);

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
    } catch (error) {
      setActionError(errorText(error, "Could not read this coding session."));
    } finally {
      setReadingPath(null);
    }
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
    const session = preview.session;
    // Only use a project root we could inspect on disk, so file tools never
    // point at a moved/deleted folder.
    const projectRoot = preview.project?.root ?? null;
    const folderId = projectRoot ? ensureFolder(projectRoot) : null;

    setImporting(true);
    setActionError(null);
    try {
      const chatId = await importKodeSession({
        title: session.title || `Continue ${providerLabel(session.provider)} session`,
        provider: session.provider,
        sessionId: session.sessionId,
        projectPath: projectRoot,
        lastActivity: session.lastActivity,
        model: session.model,
        messages: session.messages,
        folderId,
      });

      saveImportContext({
        chatId,
        provider: session.provider,
        sessionId: session.sessionId,
        sourcePath: session.sourcePath,
        projectPath: projectRoot,
        importedAt: Date.now(),
        syncedAt: Date.now(),
        syncedMessageCount: session.messages.length,
        lastMessageHash: hashMessageContent(session.messages[session.messages.length - 1]?.content ?? ""),
        autoSync: true,
        model: session.model ?? undefined,
        lastActivity: session.lastActivity,
        filesChanged: session.filesChanged,
        messageCount: session.messages.length,
        redactions: session.redactions,
        contextPrompt: preview.contextPrompt,
      });

      onClose();
    } catch (error) {
      setActionError(errorText(error, "Could not import this session."));
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-md animate-in fade-in duration-200 dark:bg-black/70">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!importing) onClose();
        }}
      />
      <div className="liquid-glass-dropdown relative z-10 flex max-h-[min(560px,86vh)] w-full max-w-[520px] flex-col overflow-hidden text-foreground">
        {preview ? (
          <ConfirmStep preview={preview} projectOptions={projectOptions} selectedTarget={selectedTarget} switchingProject={switchingProject} importing={importing} error={actionError} onTargetChange={(path) => void changeTarget(path)} onBack={backToList} onConfirm={() => void confirmImport()} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
              <div>
                <h2 className="text-[14px] font-semibold text-foreground">Import a session</h2>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">Continue work from Claude Code or Codex.</p>
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
                      </div>
                      {isReading ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground/70" />}
                    </button>
                  );
                })
              )}
            </div>

            {actionError ? <p className="border-t border-black/[0.06] px-4 py-2 text-[11px] text-red-400 dark:border-white/[0.06]">{actionError}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

function ConfirmStep({
  preview,
  projectOptions,
  selectedTarget,
  switchingProject,
  importing,
  error,
  onTargetChange,
  onBack,
  onConfirm,
}: {
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

      <div className="space-y-4 px-4 pb-4">
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

        {session.messagesDropped > 0 ? <p className="text-[11px] text-muted-foreground">{session.messagesDropped} older messages are left out to fit. Recent work is kept.</p> : null}

        {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
      </div>

      <div className="flex items-center gap-3 border-t border-black/[0.06] px-4 py-3 dark:border-white/[0.06]">
        <p className="min-w-0 flex-1 text-[10.5px] leading-snug text-muted-foreground/70">Secrets are redacted on this device before upload.</p>
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
