// Branch names Kode picks itself: new-worktree threads and sub-agents.
// Prefix from Settings → Source control → Branch prefix ("" = none).

import { invoke } from "@tauri-apps/api/core";
import { getSettings } from "./app-settings";

export function slugify(text: string, max: number): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** "kode/" → "kode/", "kode" → "kode/", "" → "". */
export function normalizePrefix(prefix: string): string {
  const clean = prefix.trim().replace(/[^A-Za-z0-9._/-]+/g, "-").replace(/^\/+/, "");
  if (!clean) return "";
  return clean.endsWith("/") || clean.endsWith("-") ? clean : `${clean}/`;
}

export function branchPrefix(): string {
  return normalizePrefix(getSettings().branchPrefix);
}

/** Branch for a new-worktree thread, named from its first message. */
export function threadBranch(firstMessage: string, prefix = branchPrefix()): string {
  const words = firstMessage.trim().split(/\s+/).slice(0, 6).join(" ");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${prefix}${slugify(words, 32) || "thread"}-${suffix}`;
}

/** Create a git worktree (~/.kontinue/worktrees/<repo>/<branch>); returns its
 *  project folder. Honours Settings → Source control → Start from origin. */
export function addWorktree(root: string, branch: string): Promise<string> {
  const settings = getSettings();
  return invoke<string>("panel_git_worktree_add", {
    root,
    branch,
    fromOrigin: settings.worktreeFromOrigin,
    baseDir: settings.worktreeLocation.trim() || null,
  });
}

/** Is this folder inside a Kode worktree (default or custom location)? */
export function isWorktreePath(path: string | null | undefined): boolean {
  if (!path) return false;
  if (path.includes("/.kontinue/worktrees/")) return true;
  const custom = getSettings().worktreeLocation.trim().replace(/\/+$/, "");
  if (!custom) return false;
  const tail = custom.startsWith("~") ? custom.slice(1) : custom;
  return path.includes(`${tail}/`);
}
