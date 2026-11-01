import {
  ArrowRight,
  Check,
  Folder,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildContinuationBundle,
  formatActivity,
  hashMessageContent,
  providerIcon,
  providerLabel,
  readCodingSession,
  readProjectState,
  saveImportContext,
  scanCodingSessions,
  type CodingSession,
  type CodingSessionSummary,
  type ContinuationBundle,
} from "@/lib/kode-import";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_SESSIONS = 3;

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

function buildProjectOptions(
  currentPath: string | null,
  currentName: string | null,
  sessionCwd: string | null,
  sessionRoot: string | null,
): ProjectOption[] {
  const options: ProjectOption[] = [];
  const add = (
    path: string | null,
    name: string | null,
    role: ProjectOption["role"],
  ) => {
    if (!path) return;
    if (options.some((option) => samePath(option.path, path))) return;
    options.push({ path, name: name ?? baseName(path), role });
  };

  // If the user is already viewing a project above the session folder (e.g.
  // the monorepo root), that is the best target. Otherwise prefer the resolved
  // repository/workspace root over the subfolder Claude/Codex was run in.
  const currentIsBroader =
    currentPath &&
    sessionCwd &&
    isAncestor(currentPath, sessionCwd) &&
    !samePath(currentPath, sessionCwd);

  if (currentIsBroader) add(currentPath, currentName, "current");
  add(sessionRoot, sessionRoot ? baseName(sessionRoot) : null, "root");
  add(currentPath, currentName, "current");
  add(sessionCwd, sessionCwd ? baseName(sessionCwd) : null, "session");

  return options;
}

function projectRoleLabel(option: ProjectOption): string {
  if (option.role === "current") return "current project";
  if (option.role === "session") return "session folder";
  return "repository root";
}

/**
 * "Continue existing work" — discovers local Claude Code / Codex sessions,
 * previews a normalized transcript, and imports it as a Kode chat with a
 * continuation context bundle.
 */
export default function KodeSessionImport({
  projectPath,
  projectName,
}: KodeSessionImportProps) {
  const { ensureFolder, importKodeSession } = useKodeWorkspace();

  const [sessions, setSessions] = useState<CodingSessionSummary[]>([]);
  const [scanning, setScanning] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanAll, setScanAll] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<ContinuationBundle | null>(null);
  const [previewSession, setPreviewSession] = useState<CodingSession | null>(
    null,
  );
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
      if (sequence === scanSequence.current) {
        setSessions(found);
      }
    } catch (error) {
      if (sequence === scanSequence.current) {
        setSessions([]);
        setScanError(
          errorText(error, "Could not read local coding sessions."),
        );
      }
    } finally {
      if (sequence === scanSequence.current) {
        setScanning(false);
      }
    }
  }, [projectPath, scanAll]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = expanded
    ? sessions
    : sessions.slice(0, MAX_VISIBLE_SESSIONS);

  const openPreview = async (summary: CodingSessionSummary) => {
    if (readingPath) return;
    setReadingPath(summary.sourcePath);
    setActionError(null);
    try {
      const session = await readCodingSession(
        summary.provider,
        summary.sourcePath,
      );
      // The currently selected project is the default target, because that is
      // what the user is looking at in Kode. The session's recorded cwd remains
      // selectable in the preview when it differs.
      const options = buildProjectOptions(
        projectPath,
        projectName,
        session.projectPath,
        session.projectRoot,
      );
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
      setActionError(
        errorText(error, "Could not read this coding session."),
      );
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
      setActionError(
        errorText(error, "Could not inspect the selected project folder."),
      );
    } finally {
      setSwitchingProject(false);
    }
  };

  const closePreview = () => {
    if (importing) return;
    setPreview(null);
    setPreviewSession(null);
    setProjectOptions([]);
    setSelectedTarget(null);
    setActionError(null);
  };

  const confirmImport = async () => {
    if (!preview || importing) return;
    const session = preview.session;
    // Only use a project root that we could actually inspect on disk, so file
    // tools never point at a moved/deleted folder.
    const projectRoot = preview.project?.root ?? null;
    const folderId = projectRoot ? ensureFolder(projectRoot) : null;

    setImporting(true);
    setActionError(null);
    try {
      const chatId = await importKodeSession({
        title:
          session.title ||
          `Continue ${providerLabel(session.provider)} session`,
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
        lastMessageHash: hashMessageContent(
          session.messages[session.messages.length - 1]?.content ?? "",
        ),
        autoSync: true,
        model: session.model ?? undefined,
        lastActivity: session.lastActivity,
        filesChanged: session.filesChanged,
        messageCount: session.messages.length,
        redactions: session.redactions,
        contextPrompt: preview.contextPrompt,
      });

      setPreview(null);
      setPreviewSession(null);
      setProjectOptions([]);
      setSelectedTarget(null);
    } catch (error) {
      setActionError(errorText(error, "Could not import this session."));
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="mt-5 w-full max-w-3xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-[12.5px] font-semibold text-foreground/85">
            Continue existing work
          </h2>
          {scanning ? (
            <Loader2 className="size-3 animate-spin text-foreground/35" />
          ) : (
            <span className="text-[10.5px] text-muted-foreground/45">
              {sessions.length > 0
                ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}`
                : ""}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={scanning}
          className="kontinue-3d flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10.5px] text-foreground/45 transition-colors hover:text-foreground/70 disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3", scanning && "animate-spin")} />
          Rescan
        </button>
      </div>

      <div className="mb-2 flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-foreground/50">
        <Folder size={11} className="shrink-0" />
        {projectPath ? (
          <>
            <span className="shrink-0 font-medium text-foreground/70">
              {projectName ?? "Current project"}
            </span>
            <span className="min-w-0 truncate text-muted-foreground/30">
              {projectPath}
            </span>
          </>
        ) : (
          <span>No project selected — showing all projects</span>
        )}
        <button
          type="button"
          onClick={() => setScanAll((current) => !current)}
          className="kontinue-3d ml-auto shrink-0 rounded-full px-2 py-1 text-[10px] text-foreground/40 transition-colors hover:text-foreground/70"
        >
          {scanAll ? "Only this project" : "All projects"}
        </button>
      </div>

      {scanError ? (
        <div className="rounded-lg border border-red-500/15 bg-red-500/[0.04] px-2.5 py-1.5 text-[10.5px] text-red-400">
          {scanError}
        </div>
      ) : scanning && sessions.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-black/[0.06] bg-black/[0.015] px-2.5 py-2 text-[10.5px] text-foreground/40 dark:border-white/[0.05] dark:bg-white/[0.015]">
          <Loader2 className="size-3 animate-spin" />
          Looking for local sessions…
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-lg border border-black/[0.06] bg-black/[0.015] px-2.5 py-2 text-[10.5px] leading-relaxed text-muted-foreground/60 dark:border-white/[0.05] dark:bg-white/[0.015]">
          {projectPath ? (
            <>
              No sessions for{" "}
              <span className="text-foreground/65">
                {projectName ?? "this project"}
              </span>
              .{" "}
              {!scanAll ? (
                <button
                  type="button"
                  onClick={() => setScanAll(true)}
                  className="text-purple-400 underline-offset-2 hover:underline"
                >
                  Scan all projects
                </button>
              ) : null}
            </>
          ) : (
            "No local sessions found yet. Start a Claude Code or Codex session, then rescan."
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-black/[0.07] bg-black/[0.015] dark:border-white/[0.06] dark:bg-white/[0.015]">
          {visible.map((session, index) => {
            const isReading = readingPath === session.sourcePath;
            return (
              <button
                key={`${session.provider}:${session.sourcePath}`}
                type="button"
                onClick={() => void openPreview(session)}
                disabled={Boolean(readingPath) && !isReading}
                className={cn(
                  "group flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-black/[0.025] disabled:cursor-wait disabled:opacity-60 dark:hover:bg-white/[0.03]",
                  index > 0 && "border-t border-black/[0.05] dark:border-white/[0.04]",
                )}
              >
                <img
                  src={providerIcon(session.provider)}
                  alt=""
                  className="size-3.5 shrink-0 object-contain dark:invert-0 invert"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium text-foreground/85">
                    {session.title}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground/50">
                    {providerLabel(session.provider)} ·{" "}
                    {baseName(session.projectRoot ?? session.projectPath ?? "") ||
                      "project unknown"}{" "}
                    · {formatActivity(session.lastActivity)}
                    {!session.projectExists ? (
                      <span className="text-amber-500/70"> · folder missing</span>
                    ) : null}
                  </p>
                </div>
                {isReading ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-foreground/40" />
                ) : (
                  <ArrowRight className="size-3.5 shrink-0 text-foreground/25 transition-colors group-hover:text-purple-300" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {sessions.length > MAX_VISIBLE_SESSIONS ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="kontinue-3d mx-auto mt-1 w-fit rounded-full px-3 py-1 text-center text-[10.5px] text-foreground/40 transition-colors hover:text-foreground/70"
        >
          {expanded
            ? "Show fewer sessions"
            : `Show all ${sessions.length} sessions`}
        </button>
      ) : null}

      {actionError && !preview ? (
        <p className="mt-1.5 text-[10.5px] text-red-400">{actionError}</p>
      ) : null}

      {preview ? (
        <ImportPreviewModal
          preview={preview}
          projectOptions={projectOptions}
          selectedTarget={selectedTarget}
          switchingProject={switchingProject}
          importing={importing}
          error={actionError}
          onTargetChange={(path) => void changeTarget(path)}
          onClose={closePreview}
          onConfirm={() => void confirmImport()}
        />
      ) : null}
    </section>
  );
}

function ImportPreviewModal({
  preview,
  projectOptions,
  selectedTarget,
  switchingProject,
  importing,
  error,
  onTargetChange,
  onClose,
  onConfirm,
}: {
  preview: ContinuationBundle;
  projectOptions: ProjectOption[];
  selectedTarget: string | null;
  switchingProject: boolean;
  importing: boolean;
  error: string | null;
  onTargetChange: (path: string | null) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const session = preview.session;
  const project = preview.project;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !importing) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [importing, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xl"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white text-foreground shadow-2xl dark:border-white/[0.08] dark:bg-[#0e0e10]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10">
              <img
                src={providerIcon(session.provider)}
                alt=""
                className="size-4 object-contain dark:invert-0 invert"
              />
            </div>
            <div>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Import session
              </p>
              <h2 className="text-[15px] font-semibold text-foreground">
                {preview.providerLabel}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold leading-snug text-foreground">
              {session.title}
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {session.projectRoot ??
                session.projectPath ??
                "Project folder not recorded"}
            </p>
            {session.projectRoot &&
            session.projectPath &&
            session.projectPath !== session.projectRoot ? (
              <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground/70">
                Session folder: {session.projectPath}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {session.messages.length} messages
              </Badge>
              {session.filesChanged.length > 0 ? (
                <Badge variant="outline" className="text-[10px]">
                  {session.filesChanged.length} files touched
                </Badge>
              ) : null}
              {project?.branch ? (
                <Badge variant="outline" className="text-[10px]">
                  {project.branch}
                </Badge>
              ) : null}
              <Badge variant="outline" className="text-[10px]">
                {formatActivity(session.lastActivity)}
              </Badge>
            </div>
          </div>

          {preview.lastTask ? (
            <div className="rounded-xl bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.025]">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Latest task
              </p>
              <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-foreground/75">
                {preview.lastTask}
              </p>
            </div>
          ) : null}

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-medium text-foreground/75">
                Continue in
              </label>
              {switchingProject ? (
                <Loader2 className="size-3.5 animate-spin text-foreground/40" />
              ) : null}
            </div>
            <select
              value={selectedTarget ?? "none"}
              onChange={(event) =>
                onTargetChange(
                  event.target.value === "none" ? null : event.target.value,
                )
              }
              disabled={importing || switchingProject}
              className="mt-1.5 h-9 w-full rounded-xl border border-black/[0.08] bg-black/[0.02] px-2.5 text-[12px] text-foreground outline-none transition-colors focus:border-purple-500/50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03]"
            >
              {projectOptions.map((option) => (
                <option key={option.path} value={option.path}>
                  {option.name} — {projectRoleLabel(option)}
                </option>
              ))}
              <option value="none">Conversation only — no folder</option>
            </select>
            <p className="mt-1 truncate text-[10px] text-muted-foreground/70">
              {selectedTarget ?? "No project folder will be attached."}
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground/70">
              The codebase stays in place. The agent opens this folder and reads
              its live git state and instructions.
            </p>
          </div>

          <div className="space-y-1.5">
            <StatusRow
              ok={preview.conversationFound}
              label="Conversation"
              detail={
                preview.conversationFound
                  ? `${session.messages.length} turns, latest task preserved`
                  : "No readable messages found"
              }
            />
            <StatusRow
              ok={Boolean(project)}
              label="Project context"
              detail={
                project
                  ? `${project.changedFiles.length} changed files · ${project.instructions.length} instruction file${
                      project.instructions.length === 1 ? "" : "s"
                    }`
                  : "Folder not found — conversation only"
              }
            />
            <StatusRow
              ok
              label="Project memory"
              detail={`${preview.memory.decisions.length} decisions · ${preview.memory.knownIssues.length} issues · ${preview.memory.touchedAreas.length} areas`}
            />
          </div>

          {session.messagesDropped > 0 ? (
            <p className="text-[10.5px] leading-relaxed text-amber-500/80">
              {session.messagesDropped} older messages were omitted to fit the
              import budget. The most recent work is intact.
            </p>
          ) : null}

          <div className="flex items-start gap-2 text-[10.5px] leading-relaxed text-muted-foreground/75">
            <ShieldCheck
              size={13}
              className="mt-0.5 shrink-0 text-foreground/40"
            />
            <p>
              The imported conversation is saved to your Kontinue account.
              Project context stays on this device and is only sent to the model
              when you continue. Secrets are redacted locally before upload
              {session.redactions > 0
                ? ` (${session.redactions} redacted)`
                : ""}
              .
            </p>
          </div>

          {error ? (
            <p className="text-[11px] text-red-400">{error}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-black/[0.06] px-5 py-3 dark:border-white/[0.06]">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={importing}
            className="kontinue-3d rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={importing || !preview.conversationFound}
            className="kontinue-3d-primary gap-1.5 rounded-full"
          >
            {importing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Importing…
              </>
            ) : (
              <>
                Import and continue <ArrowRight className="size-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      {ok ? (
        <Check size={12} className="mt-0.5 shrink-0 text-emerald-500" />
      ) : (
        <X size={12} className="mt-0.5 shrink-0 text-amber-500" />
      )}
      <p className="min-w-0 leading-relaxed">
        <span className="font-medium text-foreground/75">{label}</span>
        <span className="text-muted-foreground"> — {detail}</span>
      </p>
    </div>
  );
}

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function errorText(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return fallback;
}
