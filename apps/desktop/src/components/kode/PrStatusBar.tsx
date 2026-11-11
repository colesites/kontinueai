// The PR(s) this chat opened, docked above the chat input next to the plan: live status, Merge
// (asked for, then confirmed), checking out the PR branch, the Auto-fix
// switch, and getting back onto the base branch once the PR merges.

import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ChevronDown, GitBranch, GitMerge, GitPullRequest, Loader2, X } from "lucide-react";
import { useGitStatus } from "@/components/panel/use-git-status";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useAppSettings } from "@/lib/app-settings";
import { cleanupMergedPr, type MergedCleanup, mergePullRequest, usePrThreads } from "@/lib/kode-prs";
import {
  pickChatPr,
  type PrStanding,
  prStanding,
  type PrWatch,
  setPrAutoFix,
  updatePrWatch,
  usePrWatches,
} from "@/lib/kode-pr-watch";

const TONE: Record<PrStanding["tone"], string> = {
  good: "text-success",
  wait: "text-caution",
  bad: "text-danger",
  muted: "text-muted-foreground",
  merged: "text-brand",
};

const METHODS: { value: MergeMethod; label: string }[] = [
  { value: "squash", label: "Squash and merge" },
  { value: "merge", label: "Merge commit" },
  { value: "rebase", label: "Rebase and merge" },
];
type MergeMethod = "squash" | "merge" | "rebase";

const quietButton =
  "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50";

/** PR URLs this chat shows a bar for: open ones, and merged ones not yet answered. */
export function useVisiblePrUrls(chatId: string | null): string[] {
  const threads = usePrThreads();
  const watches = usePrWatches();
  return useMemo(
    () =>
      chatId
        ? Object.entries(threads)
            .filter(([url, t]) => {
              if (t.chatId !== chatId) return false;
              const w = watches[url];
              if (w?.state === "CLOSED") return false;
              if (w?.state === "MERGED") return !w.mergeHandled;
              return true;
            })
            .map(([url]) => url)
        : [],
    [threads, watches, chatId],
  );
}

export function PrStatusBar({
  chatId,
  projectRoot,
  className,
}: {
  chatId: string;
  projectRoot: string | null;
  className?: string;
}) {
  const watches = usePrWatches();
  const visible = useVisiblePrUrls(chatId);
  if (visible.length === 0) return null;

  return (
    <div className={cn("pointer-events-auto mx-auto mb-2 w-full space-y-2", className)}>
      {visible.map((url) => (
        <PrRow key={url} url={url} chatId={chatId} watch={watches[url]} projectRoot={projectRoot} />
      ))}
    </div>
  );
}

function PrRow({
  url,
  chatId,
  watch,
  projectRoot,
}: {
  url: string;
  chatId: string;
  watch: PrWatch | undefined;
  projectRoot: string | null;
}) {
  const { prMergeMethod } = useAppSettings();
  const { status: git, refresh: refreshGit } = useGitStatus(projectRoot, true);
  const [busy, setBusy] = useState<"merge" | "checkout" | "cleanup" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [method, setMethod] = useState<MergeMethod>(prMergeMethod);
  const [result, setResult] = useState<MergedCleanup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const standing = prStanding(watch);
  const merged = standing.stage === "merged";
  const label = watch?.number ? `#${watch.number}` : "PR";
  const onBranch = !!watch?.head && git?.branch === watch.head;

  const act = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const merge = () =>
    act("merge", async () => {
      if (!projectRoot || !watch?.number) return;
      await mergePullRequest(projectRoot, watch.number, method);
      setConfirming(false);
      // Show the merged state now; the background check confirms it later.
      updatePrWatch(url, chatId, { state: "MERGED", mergedAt: Date.now(), mergeHandled: false });
    });

  const checkOut = () =>
    act("checkout", async () => {
      if (!projectRoot || !watch?.head) return;
      await invoke("panel_git_switch", { root: projectRoot, branch: watch.head, create: false });
      await refreshGit();
    });

  const cleanUp = () =>
    act("cleanup", async () => {
      if (!projectRoot || !watch?.head || !watch.base) return;
      setResult(await cleanupMergedPr(projectRoot, watch.head, watch.base));
      await refreshGit();
    });

  const dismiss = () => updatePrWatch(url, chatId, { mergeHandled: true });

  return (
    <div className="liquid-glass-dropdown !rounded-[18px] px-3.5 py-2 text-label text-foreground">
      <div className="flex min-h-7 items-center gap-2">
        {merged ? (
          <GitMerge size={14} className="shrink-0 text-brand" />
        ) : (
          <GitPullRequest size={14} className={cn("shrink-0", TONE[standing.tone])} />
        )}
        <button
          type="button"
          onClick={() => void openUrl(url).catch(() => window.open(url, "_blank"))}
          className="min-w-0 truncate text-left font-medium hover:underline"
          title={`Open ${watch?.title ?? "the pull request"} on GitHub`}
        >
          {label}
          {watch?.title ? <span className="font-normal text-muted-foreground"> {watch.title}</span> : null}
        </button>
        <span className={cn("shrink-0 font-medium", TONE[standing.tone])}>· {standing.label}</span>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {merged ? (
            result ? (
              <button type="button" onClick={dismiss} className={quietButton}>
                Done
              </button>
            ) : (
              <>
                <button type="button" onClick={dismiss} className={quietButton}>
                  Dismiss
                </button>
                <button
                  type="button"
                  disabled={busy !== null || !projectRoot || !watch?.head}
                  onClick={() => void cleanUp()}
                  className="kontinue-3d-primary flex h-7 items-center gap-1.5 rounded-full px-3 font-medium disabled:opacity-50"
                  title={`Switch to ${watch?.base ?? "the base branch"}, pull, and delete the merged branch`}
                >
                  {busy === "cleanup" ? <Loader2 size={12} className="animate-spin" /> : null}
                  Check out {watch?.base ?? "base"}
                </button>
              </>
            )
          ) : confirming ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" disabled={busy !== null} className={cn(quietButton, "kontinue-3d text-foreground/85")}>
                    {METHODS.find((m) => m.value === method)?.label}
                    <ChevronDown size={11} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {METHODS.map((m) => (
                    <DropdownMenuItem key={m.value} onSelect={() => setMethod(m.value)}>
                      <span className="flex-1">{m.label}</span>
                      {m.value === method ? <Check /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <button type="button" disabled={busy !== null} onClick={() => setConfirming(false)} className={quietButton}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void merge()}
                className="kontinue-3d-primary flex h-7 items-center gap-1.5 rounded-full px-3 font-medium disabled:opacity-50"
              >
                {busy === "merge" ? <Loader2 size={12} className="animate-spin" /> : <GitMerge size={12} />}
                Confirm merge
              </button>
            </>
          ) : (
            <>
              <label
                className="flex h-7 cursor-pointer items-center gap-2 px-1 text-muted-foreground"
                title="Send new CI failures, merge conflicts and review comments to this chat so Kode fixes them"
              >
                Auto-fix
                <Switch
                  checked={!!watch?.autoFix}
                  onCheckedChange={(on) => setPrAutoFix(url, chatId, on)}
                  aria-label="Auto-fix this pull request"
                />
              </label>
              {projectRoot && watch?.head && git?.isRepo && !onBranch ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void checkOut()}
                  className={cn(quietButton, "kontinue-3d text-foreground/85")}
                  title={`Switch this checkout to ${watch.head}`}
                >
                  {busy === "checkout" ? <Loader2 size={12} className="animate-spin" /> : <GitBranch size={12} />}
                  Check out
                </button>
              ) : null}
              {standing.canMerge && projectRoot && watch?.number ? (
                <button
                  type="button"
                  onClick={() => {
                    setMethod(prMergeMethod);
                    setError(null);
                    setConfirming(true);
                  }}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-full px-3 font-medium",
                    standing.stage === "ready" || standing.stage === "open"
                      ? "kontinue-3d-primary"
                      : "kontinue-3d text-foreground/85",
                  )}
                >
                  <GitMerge size={12} />
                  Merge
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {confirming && !merged ? (
        <p className="mt-1 pl-6 text-muted-foreground">
          {standing.stage === "failing"
            ? `${standing.label}. Merging anyway only works if they are not required. `
            : standing.stage === "running"
              ? "Checks are still running. "
              : ""}
          Merges <span className="font-mono">{watch?.head}</span> into <span className="font-mono">{watch?.base}</span> on
          GitHub.
        </p>
      ) : null}
      {merged && !result && !error ? (
        <p className="mt-0.5 pb-0.5 pl-6 leading-relaxed text-muted-foreground">
          Merged into <span className="font-mono">{watch?.base}</span>. Checking it out switches this checkout to it,
          pulls, and deletes <span className="font-mono">{watch?.head}</span> (or its worktree). Uncommitted work is never
          touched.
        </p>
      ) : null}
      {error ? <p className="mt-1 pl-6 text-danger">{error}</p> : null}
      {result ? (
        <ul className="mt-1 space-y-0.5 pl-6">
          {result.done.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-muted-foreground">
              <Check size={12} className="mt-0.5 shrink-0 text-success" />
              {line}
            </li>
          ))}
          {result.kept.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-caution">
              <X size={12} className="mt-0.5 shrink-0" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {!merged && watch?.lastError ? (
        <p className="mt-1 pl-6 text-danger">Couldn't check this PR: {watch.lastError}</p>
      ) : null}
    </div>
  );
}

/** The PR a chat is tied to, as the chat's icon in the sidebar: open, needs
 *  work, ready to merge, or merged. Null when the chat has no PR to show. */
export function useChatPr(chatId: string): { watch: PrWatch | undefined; standing: PrStanding } | null {
  const watches = usePrWatches();
  const urls = useVisiblePrUrls(chatId);
  if (urls.length === 0) return null;
  const watch = pickChatPr(urls.map((url) => watches[url]));
  return { watch, standing: prStanding(watch) };
}

export function ChatPrIcon({ chatId }: { chatId: string }) {
  const pr = useChatPr(chatId);
  if (!pr) return null;
  const { watch, standing } = pr;
  const Icon = standing.stage === "merged" ? GitMerge : GitPullRequest;
  const name = watch?.number ? `PR #${watch.number}` : "Pull request";
  return (
    <span
      className={cn("relative flex shrink-0 items-center", TONE[standing.tone])}
      title={`${name}: ${standing.label}${watch?.autoFix ? " · Auto-fix on" : ""}`}
    >
      <Icon size={14} strokeWidth={1.75} />
      {standing.stage === "ready" ? (
        <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-success ring-2 ring-[var(--sidebar)]" />
      ) : null}
    </span>
  );
}
