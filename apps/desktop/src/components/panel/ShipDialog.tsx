// Commit, push or open a pull request without leaving Kontinue. On the default
// branch it branches off first (your changes come along), commits everything,
// pushes, and opens the PR with the GitHub CLI. The PR then shows in the panel's
// Pull requests tab; GitHub only opens if you click its link.

import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, CircleAlert, ExternalLink, GitPullRequest, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogFooter, fieldClassName } from "@/components/ui/dialog";
import { gitPush } from "./panel-api";
import {
  createPullRequest,
  draftShip,
  fallbackDraft,
  gitCommit,
  isDefaultBranch,
  shipInfo,
  switchBranch,
  type ShipAction,
  type ShipDraft,
  type ShipInfo,
} from "@/lib/kode-ship";
import { cn } from "@/lib/utils";

type Step = { id: string; label: string; state: "todo" | "doing" | "done" | "failed" };

const ACTIONS: { id: ShipAction; label: string }[] = [
  { id: "commit", label: "Commit" },
  { id: "push", label: "Commit and push" },
  { id: "pr", label: "Create PR" },
];

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "Something went wrong.";

export function ShipDialog({
  open,
  onOpenChange,
  root,
  chatTitle,
  initialAction = "pr",
  onDone,
  onViewPullRequests,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  root: string;
  chatTitle: string | null;
  initialAction?: ShipAction;
  /** Refresh git status afterwards. */
  onDone: () => void;
  onViewPullRequests: () => void;
}) {
  const [action, setAction] = useState<ShipAction>(initialAction);
  const [info, setInfo] = useState<ShipInfo | null>(null);
  const [draft, setDraft] = useState<ShipDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftPr, setDraftPr] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const running = !!steps && !error && !prUrl && steps.some((s) => s.state !== "done");
  const finished = !!steps && steps.every((s) => s.state === "done");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setAction(initialAction);
    setInfo(null);
    setDraft(null);
    setSteps(null);
    setError(null);
    setPrUrl(null);
    const controller = new AbortController();
    abort.current = controller;
    void shipInfo(root)
      .then(async (next) => {
        if (controller.signal.aborted) return;
        setInfo(next);
        setDraft(fallbackDraft(next, chatTitle));
        setDrafting(true);
        const written = await draftShip(next, chatTitle, controller.signal);
        if (!controller.signal.aborted) setDraft(written);
      })
      .catch((reason: unknown) => setError(errorText(reason)))
      .finally(() => setDrafting(false));
    return () => controller.abort();
  }, [open, root, chatTitle, initialAction]);

  const uncommitted = !!info?.status.trim();
  const onDefault = info ? isDefaultBranch(info.branch, info.defaultBranch) : false;
  // Pushing or opening a PR from the default branch would put work straight on
  // it; branch off first, like Claude Code and Codex do.
  const branchOff = onDefault && action !== "commit";
  const nothingToDo = !!info && !uncommitted && (action === "commit" || (!info.commits.trim() && !(info.unpushed ?? 0)));

  const set = (field: keyof ShipDraft, value: string) => setDraft((d) => (d ? { ...d, [field]: value } : d));

  const run = async () => {
    if (!info || !draft) return;
    const plan: Step[] = [
      ...(branchOff ? [{ id: "branch", label: `Create branch ${draft.branch}`, state: "todo" as const }] : []),
      ...(uncommitted ? [{ id: "commit", label: "Commit changes", state: "todo" as const }] : []),
      ...(action !== "commit" ? [{ id: "push", label: "Push to GitHub", state: "todo" as const }] : []),
      ...(action === "pr" ? [{ id: "pr", label: "Open pull request", state: "todo" as const }] : []),
    ];
    setSteps(plan);
    setError(null);
    const mark = (id: string, state: Step["state"]) =>
      setSteps((current) => current?.map((step) => (step.id === id ? { ...step, state } : step)) ?? current);
    let current = "";
    try {
      for (const step of plan) {
        current = step.id;
        mark(step.id, "doing");
        if (step.id === "branch") await switchBranch(root, draft.branch.trim(), true);
        if (step.id === "commit") await gitCommit(root, draft.commitMessage);
        if (step.id === "push") await gitPush(root);
        if (step.id === "pr") {
          const url = await createPullRequest(root, {
            title: draft.title,
            body: draft.body,
            base: info.defaultBranch,
            draft: draftPr,
          });
          setPrUrl(url);
        }
        mark(step.id, "done");
      }
    } catch (reason) {
      mark(current, "failed");
      setError(errorText(reason));
    } finally {
      onDone();
    }
  };

  const buttonLabel = ACTIONS.find((a) => a.id === action)?.label ?? "Create PR";

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent
        size="lg"
        title={prUrl ? "Pull request opened" : finished ? "Done" : buttonLabel}
        description={info?.branch ? `On ${info.branch}${info.defaultBranch && info.branch !== info.defaultBranch ? `, into ${info.defaultBranch}` : ""}` : undefined}
      >
        <DialogBody className="space-y-4">
          {!steps ? (
            <>
              <div className="flex gap-1 rounded-full bg-black/[0.04] p-1 dark:bg-white/[0.05]">
                {ACTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAction(item.id)}
                    className={cn(
                      "h-7 flex-1 cursor-pointer rounded-full text-label transition-colors",
                      action === item.id ? "kontinue-3d-primary font-medium" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {!info ? (
                <p className="flex items-center gap-2 text-label text-muted-foreground">
                  <Loader2 size={13} className="animate-spin" /> Reading your changes…
                </p>
              ) : draft ? (
                <>
                  {drafting ? (
                    <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
                      <Sparkles size={12} className="text-purple-500" /> Kode is writing the messages…
                    </p>
                  ) : null}
                  {branchOff ? (
                    <Field label="New branch" hint={`You're on ${info.branch ?? "the default branch"}, so the work goes on a new branch.`}>
                      <input className={fieldClassName("h-9 font-mono text-label")} value={draft.branch} onChange={(e) => set("branch", e.target.value)} />
                    </Field>
                  ) : null}
                  {uncommitted ? (
                    <Field label="Commit message" hint={`${info.status.trim().split("\n").length} changed files, all included.`}>
                      <textarea className={fieldClassName("min-h-[72px] py-2")} value={draft.commitMessage} onChange={(e) => set("commitMessage", e.target.value)} />
                    </Field>
                  ) : (
                    <p className="text-label text-muted-foreground">No uncommitted changes{info.commits.trim() ? "; the branch's commits go up as they are." : "."}</p>
                  )}
                  {action === "pr" ? (
                    <>
                      <Field label="Pull request title">
                        <input className={fieldClassName("h-9")} value={draft.title} onChange={(e) => set("title", e.target.value)} />
                      </Field>
                      <Field label="Description">
                        <textarea className={fieldClassName("min-h-[120px] py-2 font-mono text-label")} value={draft.body} onChange={(e) => set("body", e.target.value)} />
                      </Field>
                      <label className="flex cursor-pointer items-center gap-2 text-label text-muted-foreground">
                        <input type="checkbox" checked={draftPr} onChange={(e) => setDraftPr(e.target.checked)} />
                        Open as a draft
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}
              {error ? <ErrorLine text={error} /> : null}
            </>
          ) : (
            <div className="space-y-2">
              {steps.map((step) => (
                <div key={step.id} className="flex items-center gap-2.5 text-body">
                  {step.state === "done" ? (
                    <Check size={14} className="text-emerald-500" />
                  ) : step.state === "doing" ? (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  ) : step.state === "failed" ? (
                    <CircleAlert size={14} className="text-rose-500" />
                  ) : (
                    <span className="size-3.5 rounded-full border border-foreground/20" />
                  )}
                  <span className={cn("min-w-0 truncate", step.state === "todo" && "text-muted-foreground")}>{step.label}</span>
                </div>
              ))}
              {error ? <ErrorLine text={error} /> : null}
              {prUrl ? (
                <button
                  type="button"
                  onClick={() => void openUrl(prUrl).catch(() => window.open(prUrl, "_blank"))}
                  className="flex items-center gap-1.5 pt-1 font-mono text-label text-brand hover:underline"
                >
                  {prUrl.replace(/^https:\/\/github\.com\//, "")}
                  <ExternalLink size={11} />
                </button>
              ) : null}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {prUrl ? (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onViewPullRequests();
              }}
              className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-4 text-label font-medium"
            >
              <GitPullRequest size={13} /> View in Pull requests
            </button>
          ) : finished || (steps && error) ? (
            <button type="button" onClick={() => onOpenChange(false)} className="kontinue-3d h-8 cursor-pointer rounded-full px-4 text-label">
              Close
            </button>
          ) : (
            <>
              <button type="button" onClick={() => onOpenChange(false)} className="h-8 cursor-pointer rounded-full px-4 text-label text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                type="button"
                disabled={!draft || running || nothingToDo}
                title={nothingToDo ? "Nothing to commit or push." : undefined}
                onClick={() => void run()}
                className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-4 text-label font-medium disabled:cursor-default disabled:opacity-45"
              >
                {running ? <Loader2 size={13} className="animate-spin" /> : null}
                {buttonLabel}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-label font-medium text-foreground/85">{label}</span>
      {children}
      {hint ? <span className="block text-caption text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-1.5 text-label leading-relaxed text-rose-500">
      <CircleAlert size={13} className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}
