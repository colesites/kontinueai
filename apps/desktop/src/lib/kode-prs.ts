// Pull requests in the workspace panel: GitHub CLI data (src-tauri/src/panel.rs),
// a merge-readiness score for sorting, and which Kode chat opened each PR
// (found by spotting the PR's URL in that chat's messages).

import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";

type Check =
  | { __typename: "CheckRun"; name?: string; status?: string; conclusion?: string }
  | { __typename: "StatusContext"; context?: string; state?: string };

export type PullRequest = {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  author?: { login?: string } | null;
  headRefName: string;
  baseRefName: string;
  updatedAt: string;
  reviewDecision: "" | "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: string;
  statusCheckRollup?: Check[] | null;
  additions: number;
  deletions: number;
};

export type ChecksSummary = { passed: number; failed: number; pending: number; total: number };

export function summarizeChecks(checks: Check[] | null | undefined): ChecksSummary {
  const summary = { passed: 0, failed: 0, pending: 0, total: 0 };
  for (const check of checks ?? []) {
    summary.total++;
    if (check.__typename === "CheckRun") {
      if (check.status !== "COMPLETED") summary.pending++;
      else if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(check.conclusion ?? "")) summary.passed++;
      else summary.failed++;
    } else {
      const state = check.state ?? "";
      if (state === "SUCCESS") summary.passed++;
      else if (state === "PENDING" || state === "EXPECTED") summary.pending++;
      else summary.failed++;
    }
  }
  return summary;
}

export type Readiness = {
  /** Lower sorts first. */
  rank: number;
  label: string;
  tone: "good" | "wait" | "bad" | "muted";
};

/** How close a PR is to mergeable, for sorting and the status badge. */
export function prReadiness(pr: PullRequest): Readiness {
  if (pr.state === "MERGED") return { rank: 8, label: "Merged", tone: "muted" };
  if (pr.state === "CLOSED") return { rank: 9, label: "Closed", tone: "muted" };
  if (pr.isDraft) return { rank: 7, label: "Draft", tone: "muted" };
  const checks = summarizeChecks(pr.statusCheckRollup);
  if (pr.mergeable === "CONFLICTING") return { rank: 6, label: "Conflicts", tone: "bad" };
  if (checks.failed > 0) return { rank: 5, label: "Checks failing", tone: "bad" };
  if (pr.reviewDecision === "CHANGES_REQUESTED") return { rank: 4, label: "Changes requested", tone: "bad" };
  if (checks.pending > 0) return { rank: 2, label: "Checks running", tone: "wait" };
  if (pr.reviewDecision === "REVIEW_REQUIRED") return { rank: 3, label: "Needs review", tone: "wait" };
  if (pr.mergeStateStatus === "BLOCKED") return { rank: 3, label: "Blocked", tone: "wait" };
  return { rank: 0, label: "Ready to merge", tone: "good" };
}

export function sortByReadiness(prs: PullRequest[]): PullRequest[] {
  return [...prs].sort(
    (a, b) => prReadiness(a).rank - prReadiness(b).rank || Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export const listPullRequests = (root: string, state: "open" | "all") =>
  invoke<PullRequest[]>("panel_pr_list", { root, state });

export const mergePullRequest = (root: string, number: number, method: "squash" | "merge" | "rebase") =>
  invoke<void>("panel_pr_merge", { root, number, method });

export type PrComment = {
  id: string;
  kind: "comment" | "review" | "inline";
  author: string;
  body: string;
  path: string | null;
  line: number | null;
  createdAt: string;
  url: string | null;
};

/** Conversation, review and inline comments (GitHub; empty on other hosts). */
export const listPrComments = (root: string, number: number) =>
  invoke<PrComment[]>("panel_pr_comments", { root, number });

export type MergedCleanup = { done: string[]; kept: string[] };

/** Back to the base branch after a merge; never discards uncommitted or unpushed work. */
export const cleanupMergedPr = (root: string, branch: string, base: string) =>
  invoke<MergedCleanup>("panel_pr_cleanup_merged", { root, branch, base });

/** Names of the checks that finished and failed. */
export function failingCheckNames(checks: Check[] | null | undefined): string[] {
  const names: string[] = [];
  for (const check of checks ?? []) {
    if (check.__typename === "CheckRun") {
      if (check.status === "COMPLETED" && !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(check.conclusion ?? "")) {
        names.push(check.name || "check");
      }
    } else if (!["SUCCESS", "PENDING", "EXPECTED"].includes(check.state ?? "")) {
      names.push(check.context || "status");
    }
  }
  return [...new Set(names)].sort();
}

export const reviewPullRequest = (
  root: string,
  number: number,
  action: "approve" | "request_changes" | "comment",
  body?: string,
) => invoke<void>("panel_pr_review", { root, number, action, body: body ?? null });

// ---------------------------------------------------------------------------
// Which chat opened which PR
// ---------------------------------------------------------------------------

export type PrThread = { chatId: string; chatTitle: string };

const LINKS_KEY = "kode.pr-threads";
// GitHub /pull/N, GitLab (any host) /-/merge_requests/N, Bitbucket /pull-requests/N.
const PR_URL =
  /https:\/\/(?:github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+|[\w.-]+\/(?:[\w.-]+\/)+-\/merge_requests\/\d+|bitbucket\.org\/[\w.-]+\/[\w.-]+\/pull-requests\/\d+)/g;

let links: Record<string, PrThread> = loadLinks();
const listeners = new Set<() => void>();

function loadLinks(): Record<string, PrThread> {
  try {
    return JSON.parse(localStorage.getItem(LINKS_KEY) ?? "{}") as Record<string, PrThread>;
  } catch {
    return {};
  }
}

/** PR URLs mentioned in a piece of text (deduplicated, normalized). */
export function findPrUrls(text: string): string[] {
  return [...new Set((text.match(PR_URL) ?? []).map((url) => url.toLowerCase()))];
}

/** Remember the first chat that mentioned each PR URL in `texts`. */
export function recordPrLinks(chatId: string, chatTitle: string, texts: string[]) {
  let changed = false;
  const next = { ...links };
  for (const url of texts.flatMap(findPrUrls)) {
    if (!next[url]) {
      next[url] = { chatId, chatTitle };
      changed = true;
    }
  }
  if (!changed) return;
  links = next;
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify(links));
  } catch {
    // Storage blocked: links last for this session.
  }
  for (const listener of listeners) listener();
}

export function usePrThreads(): Record<string, PrThread> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => links,
  );
}

/** Current PR-to-chat links (outside React). */
export const getPrThreads = () => links;

export const prThreadFor = (threads: Record<string, PrThread>, url: string) =>
  threads[url.toLowerCase()] ?? null;
