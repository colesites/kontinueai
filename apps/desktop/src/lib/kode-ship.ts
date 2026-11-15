// Commit / push / pull request from the workspace panel, the way Claude Code
// and Codex do it: branch off when you're on the default branch, commit what
// changed, push, and open the PR with the GitHub CLI. Kode writes the branch
// name, commit message and PR text from the diff; you can edit them first.
import { invoke } from "@tauri-apps/api/core";
import { KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { sendKodeChat } from "@/lib/kode-chat";

export type ShipInfo = {
  branch: string | null;
  defaultBranch: string | null;
  status: string;
  diff: string;
  commits: string;
  unpushed: number | null;
};

export type ShipDraft = {
  branch: string;
  commitMessage: string;
  title: string;
  body: string;
};

export type ShipAction = "commit" | "push" | "pr";

export function shipInfo(root: string): Promise<ShipInfo> {
  return invoke<ShipInfo>("panel_git_ship_info", { root });
}

export function gitCommit(root: string, message: string): Promise<string> {
  return invoke<string>("panel_git_commit", { root, message });
}

export function createPullRequest(root: string, pr: { title: string; body: string; base: string | null; draft: boolean }): Promise<string> {
  return invoke<string>("panel_pr_create", { root, ...pr });
}

export function switchBranch(root: string, branch: string, create: boolean): Promise<void> {
  return invoke<void>("panel_git_switch", { root, branch, create });
}

export const isDefaultBranch = (branch: string | null, defaultBranch: string | null) =>
  !branch || branch === defaultBranch || branch === "main" || branch === "master";

/** "Fix the login redirect!" → "kontinue/fix-the-login-redirect". */
export function branchSlug(text: string, prefix = "kontinue/"): string {
  const slug = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 6)
    .join("-")
    .slice(0, 48)
    .replace(/-+$/, "");
  return `${prefix}${slug || "changes"}`;
}

/** Changed paths from `git status --short`. */
export function changedFiles(status: string): string[] {
  return status
    .split("\n")
    .map((line) => line.slice(3).trim())
    .map((path) => (path.includes(" -> ") ? path.split(" -> ")[1] : path))
    .filter(Boolean);
}

/** A sensible draft without a model: chat title, else the files. */
export function fallbackDraft(info: Pick<ShipInfo, "status" | "commits">, chatTitle: string | null): ShipDraft {
  const files = changedFiles(info.status);
  const subject = (chatTitle?.trim() || (files.length === 1 ? `Update ${files[0]}` : `Update ${files.length} files`)).replace(/\s+/g, " ");
  const title = subject.length > 72 ? `${subject.slice(0, 69).trimEnd()}…` : subject;
  const list = files.slice(0, 20).map((f) => `- \`${f}\``).join("\n");
  const more = files.length > 20 ? `\n- …and ${files.length - 20} more` : "";
  return {
    branch: branchSlug(chatTitle || title),
    commitMessage: title,
    title,
    body: files.length ? `## Changes\n\n${list}${more}\n` : info.commits ? `## Commits\n\n${info.commits}` : "",
  };
}

/** Reads the model's JSON reply; anything missing keeps the fallback's value. */
export function parseDraft(reply: string, fallback: ShipDraft): ShipDraft {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;
  try {
    const raw = JSON.parse(reply.slice(start, end + 1)) as Partial<Record<keyof ShipDraft, unknown>>;
    const text = (value: unknown, otherwise: string) => (typeof value === "string" && value.trim() ? value.trim() : otherwise);
    const branch = text(raw.branch, fallback.branch);
    return {
      branch: /^[\w./-]+$/.test(branch) && !branch.startsWith("-") ? branch : fallback.branch,
      commitMessage: text(raw.commitMessage, fallback.commitMessage),
      title: text(raw.title, fallback.title).slice(0, 120),
      body: text(raw.body, fallback.body),
    };
  } catch {
    return fallback;
  }
}

const INSTRUCTION = `You write git metadata for a developer's change. Reply with only a JSON object:
{"branch": "kontinue/<2-5 word kebab-case summary>", "commitMessage": "<imperative subject, max 72 chars>\\n\\n<optional short body>", "title": "<pull request title, max 72 chars>", "body": "<pull request description in Markdown: a one-line summary, then a short 'Changes' list>"}
Describe what changed and why, from the diff. No marketing words, no emoji.`;

/** Draft with Kode 1.0 (light on usage); falls back to the plain draft on any error. */
export async function draftShip(info: ShipInfo, chatTitle: string | null, signal?: AbortSignal): Promise<ShipDraft> {
  const fallback = fallbackDraft(info, chatTitle);
  if (!info.status.trim() && !info.commits.trim()) return fallback;
  try {
    const response = await sendKodeChat({
      kontinueServer: true,
      modelId: KODE_MODEL_ID,
      reasoningEnabled: false,
      messages: [
        {
          role: "user",
          content: `${INSTRUCTION}\n\nChat: ${chatTitle ?? "(none)"}\n\nFiles:\n${info.status || "(none)"}\n\nCommits on this branch:\n${info.commits || "(none)"}\n\nDiff:\n${info.diff}`,
        },
      ],
    });
    if (signal?.aborted) return fallback;
    return parseDraft(response.content ?? "", fallback);
  } catch {
    return fallback;
  }
}
