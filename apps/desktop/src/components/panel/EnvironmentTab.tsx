import { BackgroundTasksSections } from "./BackgroundTasks";
import { isWorktreePath } from "@/lib/kode-branches";
import { useState, type ComponentProps, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ChevronRight,
  FileDiff,
  Folder,
  GitBranch,
  GitFork,
  Globe,
  Laptop,
  Settings2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BranchPicker } from "@/components/kode/BranchPicker";
import { useEnvironment } from "@/lib/kode-environments";
import { EditEnvironmentDialog } from "./EditEnvironmentDialog";
import { api } from "@/lib/convex-api";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { useChatContext } from "@/lib/kode-chat-context";
import { PlanUsageLimits, UsageBar } from "@/components/usage/KodeUsageCard";
import { cn } from "@/lib/utils";
import { gitPush, githubWebUrl, type GitStatus } from "./panel-api";
import type { PanelTab } from "./WorkspacePanel";

type GitState = {
  status: GitStatus | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const open = (url: string) => void openUrl(url).catch(() => window.open(url, "_blank"));

/** Environment, context, connectors and changes for the current session (like Claude Code's panel). */
export function EnvironmentTab({
  projectName,
  projectPath,
  git,
  onOpenTab,
}: {
  projectName: string | null;
  projectPath: string;
  git: GitState;
  onOpenTab: (tab: PanelTab) => void;
}) {
  const { openSettings, activeChatId } = useKodeWorkspace();
  const context = useChatContext();
  const connectors = useQuery(api.connectors.listConnectors, {});
  const [contextOpen, setContextOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const environment = useEnvironment(projectPath);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [prBusy, setPrBusy] = useState(false);
  const [prNote, setPrNote] = useState<string | null>(null);

  const status = git.status;
  const inWorktree = isWorktreePath(projectPath);
  const shortPath = projectPath.replace(/^\/Users\/[^/]+/, "~");
  const contextPct = context && context.max > 0 ? Math.min(100, (context.used / context.max) * 100) : 0;

  const now = Date.now();
  const connected = (connectors ?? []).filter(
    (c) => c.connected && !(c.tokenExpiresAt && c.tokenExpiresAt < now),
  );
  const needsReconnect = (connectors ?? []).filter(
    (c) => !c.connected || (c.tokenExpiresAt && c.tokenExpiresAt < now),
  );

  const repoUrl = githubWebUrl(status?.remoteUrl ?? null);
  const branch = status?.branch ?? null;
  const onDefault = branch === "main" || branch === "master";
  const canOpenPr = !!repoUrl && !!branch && !onDefault;
  const prHint = !repoUrl
    ? "No GitHub remote"
    : onDefault
      ? "Switch to a branch to open a PR"
      : prBusy
        ? "Pushing this branch"
        : "Push this branch and open a pull request";

  const createPr = async () => {
    if (!repoUrl || !branch || onDefault || prBusy) return;
    setPrBusy(true);
    setPrNote(null);
    const uncommitted = (status?.files.length ?? 0) > 0;
    try {
      await gitPush(projectPath);
      await git.refresh();
      if (uncommitted) {
        setPrNote("Uncommitted changes stay on this computer. Commit them if they belong in the pull request.");
      }
      open(`${repoUrl}/compare/${encodeURIComponent(branch)}?expand=1`);
    } catch (error) {
      const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Couldn't push this branch.";
      setPrNote(message);
    } finally {
      setPrBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {editOpen ? (
        <EditEnvironmentDialog projectName={projectName} projectPath={projectPath} onClose={() => setEditOpen(false)} />
      ) : null}
      <Section title="Environment">
        <Row
          icon={inWorktree ? <GitFork size={14} /> : <Laptop size={14} />}
          label={environment.name || projectName || "Project"}
          trailing={
            <IconButton title="Edit environment" onClick={() => setEditOpen(true)}>
              <Settings2 size={13} />
            </IconButton>
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowButton
              icon={<Folder size={14} />}
              label={
                <>
                  {projectPath.split("/").filter(Boolean).pop()}
                  <span className="text-muted-foreground"> · {shortPath}</span>
                </>
              }
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className="w-60 p-1.5">
            <DropdownMenuItem onSelect={() => void revealItemInDir(projectPath).catch(() => undefined)}>
              Show in Finder
            </DropdownMenuItem>
            {repoUrl ? (
              <DropdownMenuItem onSelect={() => open(repoUrl)}>Open repository on GitHub</DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(projectPath).catch(() => undefined)}>
              Copy path
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOpenTab("terminal")}>Open in terminal</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {status?.isRepo ? (
          <BranchPicker root={projectPath} repoName={projectName} side="bottom" onChanged={() => void git.refresh()}>
            <RowButton
              icon={<GitBranch size={14} />}
              label={
                <>
                  {branch ?? "detached"}
                  {status.ahead > 0 ? <span className="text-muted-foreground"> · ↑{status.ahead}</span> : null}
                  {status.behind > 0 ? <span className="text-muted-foreground"> · ↓{status.behind}</span> : null}
                </>
              }
            />
          </BranchPicker>
        ) : (
          <Row
            icon={<GitBranch size={14} />}
            label={<span className="text-muted-foreground">{status ? "Not a git repository" : "Checking…"}</span>}
          />
        )}
        {repoUrl ? (
          <RowButton
            icon={<Globe size={14} />}
            label={<span className="text-muted-foreground">{repoUrl.replace("https://", "")}</span>}
            onClick={() => open(repoUrl)}
            title="Open repository on GitHub"
          />
        ) : null}
      </Section>

      <Divider />

      <Disclosure
        title="Context"
        open={contextOpen}
        onToggle={() => setContextOpen((v) => !v)}
        summary={
          <span className="flex items-center gap-2">
            <span className="tabular-nums">{context ? `${contextPct < 1 && contextPct > 0 ? contextPct.toFixed(1) : Math.round(contextPct)}%` : "—"}</span>
            <span className="w-8">
              <UsageBar pct={contextPct} className="h-1.5" />
            </span>
          </span>
        }
      >
        <div className="space-y-4 pt-2 pb-1">
          <div className="text-label text-muted-foreground">
            {context ? (
              <>
                <span className="text-foreground/90">
                  {compact.format(context.used)} / {compact.format(context.max)} tokens
                </span>{" "}
                · {context.modelName}
              </>
            ) : (
              "Open a chat to see its context."
            )}
          </div>
          <PlanUsageLimits onSeeAll={() => openSettings("usage")} />
        </div>
      </Disclosure>

      <Divider />

      <Disclosure
        title="Connectors"
        open={connectorsOpen}
        onToggle={() => setConnectorsOpen((v) => !v)}
        summary={
          connectors === undefined
            ? "…"
            : needsReconnect.length > 0
              ? `${needsReconnect.length} to reconnect`
              : `${connected.length} connected`
        }
      >
        <div className="space-y-0.5 pt-1.5">
          {(connectors ?? []).map((c) => {
            const bad = needsReconnect.includes(c);
            return (
              <div key={c._id} className="flex items-center gap-2.5 py-1 text-body">
                <span className={cn("size-1.5 rounded-full", bad ? "bg-amber-500" : "bg-emerald-500")} />
                <span className="min-w-0 flex-1 truncate capitalize">{c.provider.replace(/_/g, " ")}</span>
                <span className="text-caption text-muted-foreground">{bad ? "Reconnect" : (c.accountLabel ?? "Connected")}</span>
              </div>
            );
          })}
          {connectors && connectors.length === 0 ? (
            <p className="py-1 text-label text-muted-foreground">No connectors yet.</p>
          ) : null}
          <button
            type="button"
            onClick={() => openSettings("connectors")}
            className="cursor-pointer pt-1 text-label font-medium text-purple-500 hover:underline"
          >
            Manage connectors
          </button>
        </div>
      </Disclosure>

      <Divider />

      <Section title="Changes">
        {status?.isRepo ? (
          <>
          <div className="flex items-center gap-2.5 py-1">
            <button
              type="button"
              onClick={() => onOpenTab("changes")}
              title="View changes"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
            >
              <FileDiff size={14} className="shrink-0 text-muted-foreground" />
              {status.files.length === 0 ? (
                <span className="text-body text-muted-foreground">No changes</span>
              ) : (
                <span className="font-mono text-body">
                  <span className="text-emerald-500">+{status.additions.toLocaleString()}</span>{" "}
                  <span className="text-rose-500">−{status.deletions.toLocaleString()}</span>
                </span>
              )}
            </button>
            <button
              type="button"
              disabled={!canOpenPr || prBusy}
              title={prHint}
              onClick={() => void createPr()}
              className="kontinue-3d h-7 shrink-0 cursor-pointer rounded-full px-3 text-label text-foreground/85 disabled:cursor-default disabled:opacity-45"
            >
              {prBusy ? "Pushing…" : "Create PR"}
            </button>
          </div>
          {prNote ? <p className="pt-1 text-caption leading-relaxed text-muted-foreground">{prNote}</p> : null}
          </>
        ) : (
          <p className="py-1 text-label text-muted-foreground">{git.error ?? "Not a git repository."}</p>
        )}
      </Section>

      {/* Servers / background commands the agent started in this chat. */}
      <BackgroundTasksSections chatId={activeChatId} Section={Section} Divider={Divider} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-2">
      <h3 className="mb-1.5 text-body font-medium text-foreground/90">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function Disclosure({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="py-2">
      <button type="button" onClick={onToggle} className="flex w-full cursor-pointer items-center gap-1.5 text-left">
        <span className="text-body font-medium text-foreground/90">{title}</span>
        <ChevronRight size={12} className={cn("text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="ml-auto text-label text-muted-foreground">{summary}</span>
      </button>
      {open ? children : null}
    </section>
  );
}

function Row({
  icon,
  label,
  trailing,
  onClick,
  title,
}: {
  icon: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const body = (
    <>
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-body text-foreground/90">{label}</span>
    </>
  );
  return (
    <div className="flex items-center gap-2.5 py-1">
      {onClick ? (
        <button type="button" title={title} onClick={onClick} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left hover:text-foreground">
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">{body}</div>
      )}
      {trailing}
    </div>
  );
}

/** Full-width row that's a button (menu triggers pass props through). */
function RowButton({
  icon,
  label,
  ...props
}: { icon: ReactNode; label: ReactNode } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-2.5 rounded-full px-2 py-1 text-left transition-colors kontinue-hover data-[state=open]:bg-black/[0.05] dark:data-[state=open]:bg-white/[0.07]"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-body text-foreground/90">{label}</span>
    </button>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground kontinue-hover hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />;
}
