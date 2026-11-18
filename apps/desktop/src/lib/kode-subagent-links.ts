// Which Kode chats are sub-agent runs, and of which chat.
//
// run_subagents gives every sub-agent its own chat (so its work can be read and
// continued) and, when it may edit files, its own git worktree. That worktree is
// registered as a folder so the chat has a real project root, but it is not a
// project the person opened: listing it in the sidebar made every fan-out look
// like a pile of new projects. Claude Code shows sub-agents inside the session
// that started them; Kontinue does the same by nesting these chats under their
// parent chat.
//
// The in-memory fan-out state (kode-fanout.ts) is lost on restart, so the link
// is persisted here, keyed by chat id.
import { useSyncExternalStore } from "react";
import { isWorktreePath, slugify } from "./kode-branches";

const STORAGE_KEY = "kontinue:kode-subagents:v1";

export type SubagentLink = {
  /** Chat whose agent started this run; null when unknown (legacy runs). */
  parentChatId: string | null;
  /** Display name of the model that ran it. */
  model: string;
  /** Folder the run worked in (its worktree, or the project for read-only runs). */
  root: string;
};

function load(): Record<string, SubagentLink> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, Partial<SubagentLink>>) : {};
    const out: Record<string, SubagentLink> = {};
    for (const [chatId, link] of Object.entries(parsed)) {
      if (!link || typeof link.root !== "string") continue;
      out[chatId] = {
        parentChatId: typeof link.parentChatId === "string" ? link.parentChatId : null,
        model: typeof link.model === "string" ? link.model : "",
        root: link.root,
      };
    }
    return out;
  } catch {
    return {};
  }
}

let links: Record<string, SubagentLink> = load();
const listeners = new Set<() => void>();

function commit(next: Record<string, SubagentLink>) {
  links = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  } catch {
    // Storage blocked: links hold for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Record a sub-agent chat right after run_subagents creates it. */
export function linkSubagentChat(chatId: string, link: SubagentLink) {
  commit({ ...links, [chatId]: link });
}

/** Drop links for chats that no longer exist (deleted). */
export function pruneSubagentLinks(existingChatIds: ReadonlySet<string>) {
  const kept = Object.fromEntries(
    Object.entries(links).filter(([chatId]) => existingChatIds.has(chatId)),
  );
  if (Object.keys(kept).length !== Object.keys(links).length) commit(kept);
}

export function getSubagentLinks(): Record<string, SubagentLink> {
  return links;
}

export function useSubagentLinks(): Record<string, SubagentLink> {
  return useSyncExternalStore(subscribe, getSubagentLinks, getSubagentLinks);
}

// Fan-out branches end with a 4-character run stamp plus the model's index
// ("…-grok-4-7-high-fast-g6931"); "New worktree" threads end with exactly 4
// characters, and branches people type rarely end like this.
const FANOUT_SUFFIX = /-[a-z0-9]{4}\d+$/;
/**
 * Sub-agent worktrees made before links were recorded: a Kode worktree whose
 * branch has the fan-out stamp and whose chats are named after the same task
 * the branch was (fan-out branches are `<prefix><task slug>-<model>-<stamp>`;
 * chat titles are the task's first sentence, so the model is not in them).
 */
export function isLegacySubagentFolder(
  path: string,
  chatTitles: readonly string[],
): boolean {
  if (!isWorktreePath(path)) return false;
  const leaf = path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  if (!FANOUT_SUFFIX.test(leaf)) return false;
  return (
    chatTitles.length > 0 &&
    chatTitles.every((title) => {
      const slug = slugify(title, 24);
      return slug.length >= 4 && leaf.includes(slug);
    })
  );
}

/**
 * The repository a Kode worktree was made from, by the layout
 * `<worktree base>/<repo>/<branch>`: the repo folder's name.
 */
export function worktreeRepoName(path: string): string | null {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts.length >= 2 ? (parts[parts.length - 2] ?? null) : null;
}

/**
 * Best-effort model label for a legacy sub-agent folder, from its branch:
 * "kode-read-only-analysis-task-grok-4-7-high-fast-g6931" → "Grok 4 7 High Fast".
 */
export function legacySubagentModel(path: string, chatTitle: string): string | null {
  const leaf = path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  const slug = slugify(chatTitle, 24);
  const at = slug ? leaf.indexOf(slug) : -1;
  if (at === -1) return null;
  const model = leaf
    .slice(at + slug.length)
    .replace(FANOUT_SUFFIX, "")
    .replace(/^-+/, "");
  if (!model) return null;
  return model
    .split("-")
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}
