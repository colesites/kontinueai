import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Check,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listPullRequests,
  mergePullRequest,
  prReadiness,
  prThreadFor,
  reviewPullRequest,
  sortByReadiness,
  summarizeChecks,
  usePrThreads,
  type PullRequest,
} from "@/lib/kode-prs";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { setPrAutoFix, usePrWatches } from "@/lib/kode-pr-watch";
import { useAppSettings } from "@/lib/app-settings";
import { errorText } from "./panel-api";
import { EmptyState } from "./WorkspacePanel";

const TONE: Record<string, string> = {
  good: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  wait: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  bad: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  muted: "bg-black/[0.05] text-muted-foreground dark:bg-white/[0.06]",
};

type Pending = { number: number; action: string } | null;

/** Pull requests (GitHub, GitLab or Bitbucket) for the project, ready-to-merge first. */
export function PullRequestsTab({ projectPath, active }: { projectPath: string; active: boolean }) {
  const [state, setState] = useState<"open" | "all">("open");
  const [prs, setPrs] = useState<PullRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState<number | null>(null);
  // Inline box for "Request changes" / "Comment" (window.prompt isn't reliable in the webview).
  const [composing, setComposing] = useState<{ number: number; action: "request_changes" | "comment" } | null>(null);
  const [reviewBody, setReviewBody] = useState("");
  const threads = usePrThreads();
  const watches = usePrWatches();
  const { selectChat, setActiveTab } = useKodeWorkspace();
  const { prMergeMethod } = useAppSettings();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPrs(sortByReadiness(await listPullRequests(projectPath, state)));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [projectPath, state]);

  // Load when shown, then refresh every minute while visible.
  useEffect(() => {
    if (!active) return;
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [active, load]);

  const run = async (pr: PullRequest, action: string, task: () => Promise<void>) => {
    setPending({ number: pr.number, action });
    setActionError(null);
    try {
      await task();
      await load();
    } catch (err) {
      setActionError(`#${pr.number}: ${errorText(err)}`);
    } finally {
      setPending(null);
      setConfirmMerge(null);
    }
  };

  const tokenAsk = error ? parseNeedsToken(error) : null;
  if (tokenAsk) return <HostTokenForm ask={tokenAsk} onSaved={() => void load()} />;
  if (error && !prs) return <EmptyState>{error}</EmptyState>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 px-2">
        {(["open", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setState(value)}
            className={cn(
              "h-7 cursor-pointer rounded-full px-3 text-label transition-colors",
              state === value
                ? "kontinue-menu-active"
                : "text-muted-foreground kontinue-hover",
            )}
          >
            {value === "open" ? "Open" : "All"}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Refresh pull requests"
          onClick={() => void load()}
          className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground kontinue-hover hover:text-foreground"
        >
          <RefreshCw size={13} className={cn(loading && "animate-spin")} />
        </button>
      </div>

      {actionError ? <p className="px-3 pb-1 text-label text-rose-400">{actionError}</p> : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!prs ? (
          <EmptyState>
            <Loader2 className="size-4 animate-spin" />
          </EmptyState>
        ) : prs.length === 0 ? (
          <EmptyState>{state === "open" ? "No open pull requests." : "No pull requests yet."}</EmptyState>
        ) : (
          <ul className="space-y-1.5">
            {prs.map((pr) => {
              const readiness = prReadiness(pr);
              const checks = summarizeChecks(pr.statusCheckRollup);
              const thread = prThreadFor(threads, pr.url);
              const busy = pending?.number === pr.number;
              const open = pr.state === "OPEN";
              return (
                <li key={pr.number} className="kontinue-3d rounded-[16px] px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <GitPullRequest
                      size={14}
                      className={cn(
                        "mt-0.5 shrink-0",
                        pr.state === "MERGED" ? "text-purple-500" : open ? "text-emerald-500" : "text-muted-foreground",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => void openUrl(pr.url)}
                        className="block w-full cursor-pointer truncate text-left text-body font-medium hover:underline"
                        title={pr.title}
                      >
                        {pr.title}
                      </button>
                      <p className="mt-0.5 truncate font-mono text-caption text-muted-foreground">
                        #{pr.number} · {pr.headRefName} → {pr.baseRefName}
                        <span className="text-emerald-500"> +{pr.additions}</span>
                        <span className="text-rose-500"> −{pr.deletions}</span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-caption">
                        <span className={cn("rounded-full px-2 py-0.5 font-medium", TONE[readiness.tone])}>
                          {readiness.label}
                        </span>
                        {checks.total > 0 ? (
                          <span className="text-muted-foreground">
                            Checks {checks.passed}/{checks.total}
                            {checks.failed ? `, ${checks.failed} failing` : ""}
                            {checks.pending ? `, ${checks.pending} running` : ""}
                          </span>
                        ) : null}
                        {thread ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab("kode");
                              selectChat(thread.chatId);
                            }}
                            className="flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-purple-500 hover:bg-purple-500/10"
                            title="Open the chat that opened this PR"
                          >
                            <MessageSquare size={10} />
                            <span className="max-w-36 truncate">{thread.chatTitle}</span>
                          </button>
                        ) : null}
                        {thread && open ? (
                          <label
                            className="flex cursor-pointer items-center gap-1.5 text-muted-foreground"
                            title="Send new CI failures, merge conflicts and review comments to that chat so Kode fixes them"
                          >
                            Auto-fix
                            <Switch
                              checked={!!watches[pr.url.toLowerCase()]?.autoFix}
                              onCheckedChange={(on) => setPrAutoFix(pr.url, thread.chatId, on)}
                              aria-label={`Auto-fix PR #${pr.number}`}
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>

                    {open ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {confirmMerge === pr.number ? (
                          <DropdownMenu open onOpenChange={(o) => !o && setConfirmMerge(null)}>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="kontinue-3d-primary flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-label font-medium"
                              >
                                <GitMerge size={12} /> Merge
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={6} className="w-44 p-1.5">
                              {(["squash", "merge", "rebase"] as const)
                                .slice()
                                .sort((a, b) => Number(b === prMergeMethod) - Number(a === prMergeMethod))
                                .map((method) => (
                                <DropdownMenuItem
                                  key={method}
                                  onSelect={() =>
                                    void run(pr, "merge", () => mergePullRequest(projectPath, pr.number, method))
                                  }
                                  className="px-3 py-1.5 text-label"
                                >
                                  {method === "squash"
                                    ? "Squash and merge"
                                    : method === "merge"
                                      ? "Create a merge commit"
                                      : "Rebase and merge"}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <button
                            type="button"
                            disabled={busy || pr.isDraft}
                            onClick={() => setConfirmMerge(pr.number)}
                            title={pr.isDraft ? "Draft PRs can't be merged" : "Merge"}
                            className={cn(
                              "flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-label font-medium disabled:cursor-not-allowed disabled:opacity-40",
                              readiness.tone === "good" ? "kontinue-3d-primary" : "kontinue-3d text-foreground/80",
                            )}
                          >
                            {busy && pending?.action === "merge" ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <GitMerge size={12} />
                            )}
                            Merge
                          </button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="More actions"
                              disabled={busy}
                              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground kontinue-hover hover:text-foreground disabled:opacity-40"
                            >
                              {busy && pending?.action !== "merge" ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <MoreHorizontal size={14} />
                              )}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sideOffset={6} className="w-48 p-1.5">
                            <DropdownMenuItem
                              onSelect={() =>
                                void run(pr, "approve", () => reviewPullRequest(projectPath, pr.number, "approve"))
                              }
                              className="flex items-center gap-2 px-3 py-1.5 text-label"
                            >
                              <Check size={13} className="text-emerald-500" /> Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setReviewBody("");
                                setComposing({ number: pr.number, action: "request_changes" });
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 text-label"
                            >
                              <XCircle size={13} className="text-rose-500" /> Request changes…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setReviewBody("");
                                setComposing({ number: pr.number, action: "comment" });
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 text-label"
                            >
                              <MessageSquare size={13} /> Comment…
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => void openUrl(pr.url)}
                              className="flex items-center gap-2 px-3 py-1.5 text-label"
                            >
                              <ExternalLink size={13} /> Open on GitHub
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : null}
                  </div>
                  {composing?.number === pr.number ? (
                    <form
                      className="mt-2 flex flex-col gap-1.5 pl-6"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const body = reviewBody.trim();
                        if (!body) return;
                        const action = composing.action;
                        setComposing(null);
                        void run(pr, action, () => reviewPullRequest(projectPath, pr.number, action, body));
                      }}
                    >
                      <textarea
                        autoFocus
                        rows={3}
                        value={reviewBody}
                        onChange={(e) => setReviewBody(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setComposing(null);
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
                        }}
                        placeholder={composing.action === "request_changes" ? "What needs to change?" : "Leave a comment"}
                        className="w-full resize-none rounded-[12px] bg-black/[0.04] px-3 py-2 text-label outline-none placeholder:text-muted-foreground/60 dark:bg-white/[0.05]"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setComposing(null)}
                          className="kontinue-3d h-7 cursor-pointer rounded-full px-3 text-label"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!reviewBody.trim()}
                          className="kontinue-3d-primary h-7 cursor-pointer rounded-full px-3 text-label font-medium disabled:opacity-50"
                        >
                          {composing.action === "request_changes" ? "Request changes" : "Comment"}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

type TokenAsk = { kind: "gitlab" | "bitbucket"; host: string; message: string };

/** "[[needs-token:gitlab:gitlab.com]] message" → what to ask for. */
export function parseNeedsToken(error: string): TokenAsk | null {
  const match = error.match(/\[\[needs-token:(gitlab|bitbucket):([^\]]+)\]\]\s*(.*)/s);
  return match ? { kind: match[1] as TokenAsk["kind"], host: match[2], message: match[3] } : null;
}

function HostTokenForm({ ask, onSaved }: { ask: TokenAsk; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const bitbucket = ask.kind === "bitbucket";
  const help = bitbucket
    ? "https://support.atlassian.com/bitbucket-cloud/docs/create-an-api-token/"
    : `https://${ask.host}/-/user_settings/personal_access_tokens?name=Kontinue&scopes=api`;
  const save = async () => {
    setSaving(true);
    setFailed(null);
    try {
      await invoke("kode_git_host_token_set", { host: ask.host, kind: ask.kind, token: bitbucket ? `${email.trim()}:${token.trim()}` : token.trim() });
      setToken("");
      onSaved();
    } catch (err) {
      setFailed(errorText(err));
    } finally {
      setSaving(false);
    }
  };
  const input = "kontinue-3d h-8 w-full rounded-full bg-transparent px-3 text-label outline-none placeholder:text-muted-foreground/60";
  return (
    <div className="mx-auto mt-10 w-full max-w-sm space-y-2.5 px-4 text-label">
      <p className="font-medium text-foreground">{bitbucket ? "Connect Bitbucket" : `Connect GitLab (${ask.host})`}</p>
      <p className="text-muted-foreground">{ask.message} The token stays in your Mac's keychain.</p>
      {bitbucket ? <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Atlassian account email" className={input} /> : null}
      <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={bitbucket ? "Bitbucket API token" : "Personal access token (api scope)"} className={input} />
      {failed ? <p className="text-rose-400">{failed}</p> : null}
      <div className="flex items-center gap-2">
        <button type="button" disabled={saving || !token.trim() || (bitbucket && !email.trim())} onClick={() => void save()} className="kontinue-3d-primary h-8 cursor-pointer rounded-full px-3.5 text-label font-medium disabled:cursor-default disabled:opacity-60">
          {saving ? "Saving…" : "Save token"}
        </button>
        <button type="button" onClick={() => void openUrl(help)} className="cursor-pointer text-purple-600 hover:underline dark:text-purple-400">
          Create a token
        </button>
      </div>
    </div>
  );
}
