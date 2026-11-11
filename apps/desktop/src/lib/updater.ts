// App updates from GitHub Releases (tauri-plugin-updater). The app checks
// quietly a little after launch and every few hours; "Check for Updates…" in
// the menu checks right away and always reports back. Shown by UpdateDialog.

import { useSyncExternalStore } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "current" }
  | { status: "available"; version: string; notes: string | null }
  | { status: "downloading"; version: string; progress: number | null }
  | { status: "ready"; version: string }
  | { status: "error"; message: string };

let state = { status: "idle" } as UpdateState;
/** Whether the dialog is showing. Quiet checks only open it when there's an update. */
let open = false;
let pending: Update | null = null;
const listeners = new Set<() => void>();

const SKIPPED_KEY = "kontinue.update.skipped";

function set(next: UpdateState, show?: boolean) {
  state = next;
  if (show !== undefined) open = show;
  for (const listener of listeners) listener();
}

let snapshot: { state: UpdateState; open: boolean } = { state, open };
function getSnapshot() {
  if (snapshot.state !== state || snapshot.open !== open) snapshot = { state, open };
  return snapshot;
}

export function useUpdater() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getSnapshot);
}

export function closeUpdateDialog() {
  // Closing while it's working keeps it going in the background.
  if (state.status === "available") {
    try {
      localStorage.setItem(SKIPPED_KEY, state.version);
    } catch {
      // Not remembered; it'll ask again next launch.
    }
  }
  set(state, false);
}

function message(error: unknown) {
  const text = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  return text || "Couldn't check for updates.";
}

export async function checkForUpdates({ interactive }: { interactive: boolean }) {
  if (state.status === "checking" || state.status === "downloading") {
    if (interactive) set(state, true);
    return;
  }
  // A downloaded update is waiting for a restart: just show that again.
  if (state.status === "ready") {
    if (interactive) set(state, true);
    return;
  }
  if (interactive) set({ status: "checking" }, true);
  try {
    const update = await check();
    if (!update) {
      pending = null;
      set(interactive ? { status: "current" } : { status: "idle" });
      return;
    }
    pending = update;
    let skipped: string | null = null;
    try {
      skipped = localStorage.getItem(SKIPPED_KEY);
    } catch {
      // ignore
    }
    const next: UpdateState = { status: "available", version: update.version, notes: update.body?.trim() || null };
    // A quiet check doesn't nag about a version the user already put off.
    set(next, interactive || skipped !== update.version ? true : open);
  } catch (error) {
    if (interactive) set({ status: "error", message: message(error) }, true);
    else set({ status: "idle" });
  }
}

export async function installUpdate() {
  const update = pending;
  if (!update) return;
  let total = 0;
  let received = 0;
  set({ status: "downloading", version: update.version, progress: null });
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      else if (event.event === "Progress") {
        received += event.data.chunkLength;
        set({ status: "downloading", version: update.version, progress: total ? Math.min(1, received / total) : null });
      }
    });
    set({ status: "ready", version: update.version });
  } catch (error) {
    set({ status: "error", message: message(error) }, true);
  }
}

export async function restartToUpdate() {
  await relaunch();
}

let started = false;
/** Quiet checks: shortly after launch, then every 6 hours. Dev builds don't check. */
export function startUpdateChecks() {
  if (started || import.meta.env.DEV) return;
  started = true;
  setTimeout(() => void checkForUpdates({ interactive: false }), 15_000);
  setInterval(() => void checkForUpdates({ interactive: false }), 6 * 60 * 60 * 1000);
}
