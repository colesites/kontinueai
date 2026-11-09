// Typed wrappers around the Rust panel commands (src-tauri/src/panel.rs) and
// the existing project file commands.
import { Channel, invoke } from "@tauri-apps/api/core";

export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

export type GitFileChange = {
  path: string;
  status: GitFileStatus;
  additions: number;
  deletions: number;
};

export type GitStatus = {
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileChange[];
  additions: number;
  deletions: number;
  remoteUrl: string | null;
};

/** https://github.com/owner/repo for a GitHub remote (ssh or https), else null. */
export function githubWebUrl(remote: string | null): string | null {
  if (!remote) return null;
  const match = remote.trim().match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/i);
  return match ? `https://github.com/${match[1]}/${match[2]}` : null;
}

export type FileEntry = { name: string; path: string; is_dir: boolean };

export function gitPush(root: string): Promise<void> {
  return invoke<void>("panel_git_push", { root });
}

export function gitStatus(root: string): Promise<GitStatus> {
  return invoke<GitStatus>("panel_git_status", { root });
}

export function gitDiff(
  root: string,
  path: string,
  untracked: boolean,
): Promise<string> {
  return invoke<string>("panel_git_diff", { root, path, untracked });
}

export function listDir(root: string, path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("kode_list_dir", { root, path });
}

export function readFile(root: string, path: string): Promise<string> {
  return invoke<string>("kode_read_file", { root, path });
}

export function writeFile(
  root: string,
  path: string,
  content: string,
): Promise<void> {
  return invoke<void>("kode_write_file", { root, path, content });
}

type PtyEvent = { kind: "data"; data: string } | { kind: "exit" };

export async function spawnTerminal(options: {
  cwd: string | null;
  env?: Record<string, string>;
  cols: number;
  rows: number;
  onData: (data: string) => void;
  onExit: () => void;
}): Promise<number> {
  const channel = new Channel<PtyEvent>();
  channel.onmessage = (event) => {
    if (event.kind === "data") options.onData(event.data);
    else options.onExit();
  };
  return invoke<number>("pty_spawn", {
    cwd: options.cwd,
    env: options.env ?? null,
    cols: options.cols,
    rows: options.rows,
    onEvent: channel,
  });
}

export const writeTerminal = (id: number, data: string) =>
  invoke<void>("pty_write", { id, data });

export const resizeTerminal = (id: number, cols: number, rows: number) =>
  invoke<void>("pty_resize", { id, cols, rows });

export const killTerminal = (id: number) => invoke<void>("pty_kill", { id });

export function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
