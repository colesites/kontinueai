// The PR(s) this chat opened, above the conversation: live status, the
// Auto-fix switch, and a clean-up offer once the PR merges.

import { useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, GitMerge, GitPullRequest, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { cleanupMergedPr, type MergedCleanup, usePrThreads } from "@/lib/kode-prs";
import { type PrWatch, setPrAutoFix, updatePrWatch, usePrWatches } from "@/lib/kode-pr-watch";

function statusOf(watch: PrWatch | undefined): { label: string; tone: string } {
  if (!watch?.state) return { label: "Checking…", tone: "text-muted-foreground" };
  if (watch.state === "MERGED") return { label: "Merged", tone: "text-purple-500" };
  if (watch.state === "CLOSED") return { label: "Closed", tone: "text-muted-foreground" };
  if (watch.conflicting) return { label: "Merge conflict", tone: "text-rose-500" };
  const checks = watch.checks;
  if (checks?.failed) return { label: `${checks.failed} check${checks.failed === 1 ? "" : "s"} failing`, tone: "text-rose-500" };
  if (checks?.pending) return { label: "Checks running", tone: "text-amber-500" };
  if (checks?.total) return { label: "Checks passed", tone: "text-emerald-500" };
  return { label: "Open", tone: "text-emerald-500" };
}

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
    <div className={cn("mx-auto w-full max-w-3xl space-y-1.5 px-4", className)}>
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
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<MergedCleanup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = statusOf(watch);
  const merged = watch?.state === "MERGED";
  const label = watch?.number ? `#${watch.number}` : "PR";

  const cleanUp = async () => {
    if (!projectRoot || !watch?.head || !watch.base) return;
    setCleaning(true);
    setError(null);
    try {
      setResult(await cleanupMergedPr(projectRoot, watch.head, watch.base));
    } catch (e) {
      setError(String(e));
    } finally {
      setCleaning(false);
    }
  };
  const dismiss = () => updatePrWatch(url, chatId, { mergeHandled: true });

  return (
    <div className="liquid-glass-pill rounded-2xl px-3 py-2 text-[12px]">
      <div className="flex items-center gap-2">
        {merged ? (
          <GitMerge size={14} className="shrink-0 text-purple-500" />
        ) : (
          <GitPullRequest size={14} className="shrink-0 text-emerald-500" />
        )}
        <button
          type="button"
          onClick={() => void openUrl(url).catch(() => window.open(url, "_blank"))}
          className="min-w-0 cursor-pointer truncate text-left font-medium hover:underline"
          title={watch?.title ?? url}
        >
          {label}
          {watch?.title ? <span className="font-normal text-muted-foreground"> {watch.title}</span> : null}
        </button>
        <span className={cn("shrink-0 font-medium", status.tone)}>· {status.label}</span>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {merged ? (
            result ? (
              <button
                type="button"
                onClick={dismiss}
                className="cursor-pointer rounded-full px-2.5 py-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={dismiss}
                  className="cursor-pointer rounded-full px-2.5 py-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  disabled={cleaning || !projectRoot || !watch?.head}
                  onClick={() => void cleanUp()}
                  className="kontinue-3d-primary flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  title={`Switch to ${watch?.base ?? "the base branch"}, pull, and delete the merged branch`}
                >
                  {cleaning ? <Loader2 size={12} className="animate-spin" /> : null}
                  Clean up
                </button>
              </>
            )
          ) : (
            <label
              className="flex cursor-pointer items-center gap-2 text-muted-foreground"
              title="Send new CI failures, merge conflicts and review comments to this chat so Kode fixes them"
            >
              Auto-fix
              <Switch
                checked={!!watch?.autoFix}
                onCheckedChange={(on) => setPrAutoFix(url, chatId, on)}
                aria-label="Auto-fix this pull request"
              />
            </label>
          )}
        </div>
      </div>

      {merged && !result && !error ? (
        <p className="mt-1 pl-6 text-[11.5px] text-muted-foreground">
          Merged into <span className="font-mono">{watch?.base}</span>. Clean up switches this checkout to it, pulls, and
          deletes <span className="font-mono">{watch?.head}</span> (or its worktree). Uncommitted work is never touched.
        </p>
      ) : null}
      {error ? <p className="mt-1 pl-6 text-[11.5px] text-rose-500">{error}</p> : null}
      {result ? (
        <ul className="mt-1 space-y-0.5 pl-6 text-[11.5px]">
          {result.done.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-muted-foreground">
              <Check size={12} className="mt-0.5 shrink-0 text-emerald-500" />
              {line}
            </li>
          ))}
          {result.kept.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-amber-500">
              <X size={12} className="mt-0.5 shrink-0" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {!merged && watch?.lastError ? (
        <p className="mt-1 pl-6 text-[11.5px] text-rose-500">Couldn't check this PR: {watch.lastError}</p>
      ) : null}
    </div>
  );
}

/** Small PR icon for a chat in the sidebar: merged, needs attention, or open. */
export function ChatPrBadge({ chatId }: { chatId: string }) {
  const watches = usePrWatches();
  const urls = useVisiblePrUrls(chatId);
  if (urls.length === 0) return null;
  // Most urgent first.
  const states = urls.map((url) => watches[url]);
  const needsWork = states.find((w) => w?.state === "OPEN" && (w.conflicting || w.checks?.failed));
  const merged = states.find((w) => w?.state === "MERGED");
  const watch = needsWork ?? merged ?? states[0];
  const status = statusOf(watch);
  const Icon = merged && !needsWork ? GitMerge : GitPullRequest;
  return (
    <span
      className={cn("flex shrink-0 items-center", status.tone)}
      title={`${watch?.number ? `PR #${watch.number}` : "Pull request"}: ${status.label}${watch?.autoFix ? " · Auto-fix on" : ""}`}
    >
      <Icon size={11} />
    </span>
  );
}
