// Settings → Source control: git tooling on this Mac, how Kode watches the
// pull requests its chats open, and every PR it's watching.

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, GitPullRequest, Loader2, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { updateSettings, useAppSettings } from "@/lib/app-settings";
import { setPrAutoFix, usePrWatches, type PrWatch } from "@/lib/kode-pr-watch";
import { prThreadFor, usePrThreads } from "@/lib/kode-prs";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { staleBuildMessage } from "./settings-ui";
import { Card, Empty, LinkButton, openExternal, PillButton, Row, Select, Tag, TextField } from "./settings-ui";
import { normalizePrefix } from "@/lib/kode-branches";

type ToolStatus = {
  id: "git" | "gh";
  available: boolean;
  version: string | null;
  detail: string | null;
  signedIn: boolean | null;
};

const STATE_TAG: Record<string, { label: string; tone: "green" | "purple" | "neutral" | "red" }> = {
  OPEN: { label: "Open", tone: "green" },
  MERGED: { label: "Merged", tone: "purple" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export function SourceControlSection({ onClose }: { onClose: () => void }) {
  const settings = useAppSettings();
  return (
    <>
      <ToolsCard />

      <Card title="Worktrees and branches">
        <Row
          label="New threads start in"
          description="A new worktree gives each thread its own folder and branch, named from your first message. Also switchable from the composer's Work in menu."
        >
          <Select
            value={settings.newThreadWorkspace}
            options={[
              { value: "local", label: "Current checkout" },
              { value: "worktree", label: "New worktree" },
            ]}
            onChange={(value) => updateSettings({ newThreadWorkspace: value })}
          />
        </Row>
        <Row
          label="Start from origin"
          description="Create new worktrees from the latest origin/<current branch> instead of your local branch. Falls back to local if the fetch fails."
        >
          <Switch
            checked={settings.worktreeFromOrigin}
            onCheckedChange={(checked) => updateSettings({ worktreeFromOrigin: checked })}
          />
        </Row>
        <Row
          label="Branch prefix"
          description={
            <>
              For branches Kode names (new worktrees, sub-agents). For example, <span className="font-mono">kode/</span>{" "}
              gives <span className="font-mono">{normalizePrefix(settings.branchPrefix) || ""}fix-login-a1b2</span>. Leave empty for no prefix.
            </>
          }
        >
          <TextField
            value={settings.branchPrefix}
            onChange={(value) => updateSettings({ branchPrefix: value })}
            placeholder="No prefix"
            className="w-44 rounded-xl font-mono"
          />
        </Row>
      </Card>

      <Card title="Pull requests">
        <Row
          label="Auto-fix new pull requests"
          description="When a Kode chat opens a PR, send new CI failures, merge conflicts and review comments back into that chat so the agent fixes them. You can still turn it off per PR."
        >
          <Switch
            checked={settings.prAutoFixDefault}
            onCheckedChange={(checked) => updateSettings({ prAutoFixDefault: checked })}
          />
        </Row>
        <Row
          label="Auto-archive merged threads"
          description="When a PR a Kode thread opened merges, archive that thread (unless it's open). Find it in Data → Archived."
        >
          <Switch
            checked={settings.autoArchiveMerged}
            onCheckedChange={(checked) => updateSettings({ autoArchiveMerged: checked })}
          />
        </Row>
        <Row label="Check pull requests" description="How often Kode checks the PRs your chats opened while the app is open.">
          <Select
            value={String(settings.prPollSeconds)}
            options={[
              { value: "60", label: "Every minute" },
              { value: "120", label: "Every 2 minutes" },
              { value: "300", label: "Every 5 minutes" },
              { value: "0", label: "Paused", description: "No background checks or Auto-fix" },
            ]}
            onChange={(value) => updateSettings({ prPollSeconds: Number(value) })}
          />
        </Row>
        <Row label="Default merge method" description="Listed first when you merge from the Pull requests panel.">
          <Select
            value={settings.prMergeMethod}
            options={[
              { value: "squash", label: "Squash and merge" },
              { value: "merge", label: "Create a merge commit" },
              { value: "rebase", label: "Rebase and merge" },
            ]}
            onChange={(value) => updateSettings({ prMergeMethod: value })}
          />
        </Row>
      </Card>

      <WatchedPrsCard onClose={onClose} />
    </>
  );
}

// Last check, kept for the session so coming back shows it at once.
let lastTools: ToolStatus[] | null = null;

function ToolsCard() {
  const [tools, setToolsState] = useState<ToolStatus[] | null>(lastTools);
  const setTools = (next: ToolStatus[]) => {
    lastTools = next;
    setToolsState(next);
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTools(await invoke<ToolStatus[]>("settings_tool_status"));
      setError(null);
    } catch (cause) {
      setError(staleBuildMessage(cause));
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const git = tools?.find((t) => t.id === "git");
  const gh = tools?.find((t) => t.id === "gh");

  return (
    <Card
      title="Version control"
      action={
        <LinkButton onClick={() => void load()} disabled={loading}>
          <RefreshCw size={12} className={loading ? "animate-spin" : undefined} />
          Refresh
        </LinkButton>
      }
    >
      {error ? <p className="px-5 py-3 text-label text-amber-600 dark:text-amber-400">{error}</p> : null}
      <Row
        label="Git"
        badge={git?.version ? <span className="font-mono text-caption font-normal text-muted-foreground">{git.version}</span> : null}
        description={!tools ? "Checking…" : error ? "Couldn't check." : git?.available ? "Available" : "Not found. Install the Xcode Command Line Tools (xcode-select --install)."}
      >
        <StatusDot ok={git?.available} loading={!tools} />
      </Row>
      <Row
        label="GitHub"
        badge={gh?.version ? <span className="font-mono text-caption font-normal text-muted-foreground">gh {gh.version}</span> : null}
        description={
          !tools
            ? "Checking…"
            : error
              ? "Couldn't check."
              : !gh?.available
              ? "GitHub CLI not found. Install it (brew install gh), then run gh auth login. Needed for pull requests."
              : gh.signedIn
                ? `Signed in as ${gh.detail ?? "your account"}`
                : (gh.detail ?? "Not signed in. Run gh auth login.")
        }
      >
        {gh?.available && gh.signedIn === false ? <Tag tone="amber">Not signed in</Tag> : null}
        <StatusDot ok={gh?.available && gh.signedIn !== false} loading={!tools} />
      </Row>
      <Row
        label="GitLab and Bitbucket"
        description="Use an access token instead of a CLI. The Pull requests panel asks for one the first time you open a project hosted there; it's kept in your keychain."
      />
    </Card>
  );
}

function StatusDot({ ok, loading }: { ok: boolean | undefined; loading: boolean }) {
  if (loading) return <Loader2 size={13} className="animate-spin text-muted-foreground" />;
  return (
    <span
      className={ok ? "size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "size-2 rounded-full bg-zinc-400/60"}
      aria-label={ok ? "Available" : "Unavailable"}
    />
  );
}

function WatchedPrsCard({ onClose }: { onClose: () => void }) {
  const watches = usePrWatches();
  const threads = usePrThreads();
  const { setActiveTab, selectChat } = useKodeWorkspace();
  const [showDone, setShowDone] = useState(false);

  const list = useMemo(() => {
    const all = Object.values(watches);
    const rank = (w: PrWatch) => (w.state === "OPEN" || !w.state ? 0 : 1);
    return all
      .filter((w) => showDone || rank(w) === 0)
      .sort((a, b) => rank(a) - rank(b) || (b.lastCheckedAt ?? 0) - (a.lastCheckedAt ?? 0));
  }, [watches, showDone]);
  const doneCount = Object.values(watches).filter((w) => w.state === "MERGED" || w.state === "CLOSED").length;

  return (
    <Card
      title={`Watched pull requests${list.length ? ` (${list.length})` : ""}`}
      action={
        doneCount ? (
          <LinkButton onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide merged and closed" : `Show merged and closed (${doneCount})`}
          </LinkButton>
        ) : null
      }
    >
      {list.length === 0 ? (
        <Empty title="No pull requests">PRs a Kode chat opens show up here, with their checks and Auto-fix.</Empty>
      ) : (
        list.map((watch) => {
          const state = STATE_TAG[watch.state ?? "OPEN"] ?? STATE_TAG.OPEN;
          const checks = watch.checks;
          const thread = prThreadFor(threads, watch.url);
          return (
            <div key={watch.url} className="flex items-center gap-4 px-5 py-3">
              <GitPullRequest size={14} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-body font-medium text-foreground/90">
                  <span className="truncate">
                    {watch.number ? `#${watch.number} ` : ""}
                    {watch.title ?? watch.url}
                  </span>
                  <Tag tone={state.tone}>{state.label}</Tag>
                  {watch.conflicting ? <Tag tone="red">Conflicts</Tag> : null}
                </p>
                <p className="mt-0.5 truncate text-caption text-muted-foreground">
                  {watch.head ? (
                    <span className="font-mono">
                      {watch.head} → {watch.base}
                    </span>
                  ) : null}
                  {checks && checks.total ? (
                    <span>
                      {" · "}
                      {checks.failed ? `${checks.failed} failing` : checks.pending ? `${checks.pending} running` : "Checks passed"}
                    </span>
                  ) : null}
                  {thread ? (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="cursor-pointer hover:text-foreground hover:underline"
                        onClick={() => {
                          onClose();
                          setActiveTab("kode");
                          selectChat(thread.chatId);
                        }}
                      >
                        {thread.chatTitle || "Open chat"}
                      </button>
                    </>
                  ) : null}
                </p>
              </div>
              {watch.state === "OPEN" || !watch.state ? (
                <label className="flex items-center gap-2 text-label text-muted-foreground">
                  Auto-fix
                  <Switch
                    checked={watch.autoFix}
                    onCheckedChange={(on) => setPrAutoFix(watch.url, watch.chatId, on)}
                    aria-label={`Auto-fix ${watch.title ?? watch.url}`}
                  />
                </label>
              ) : null}
              <PillButton onClick={() => openExternal(watch.url)} title="Open on the web">
                <ExternalLink size={12} />
              </PillButton>
            </div>
          );
        })
      )}
    </Card>
  );
}
