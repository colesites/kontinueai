// Per-model context window for the context meter. Kode models carry their
// window in the catalog (packages/ai/src/lib/kode.ts); anything else falls back
// to the live gateway catalog fetched once via Rust.

import { invoke } from "@tauri-apps/api/core";
import { getKodeModelById, kodeContextBudget } from "@repo/ai/lib/kode";

const DEFAULT_WINDOW = 128_000;

export type ContextWindows = Record<string, number>;

let cache: ContextWindows | null = null;

/** Fetch + cache the slug → window map. Safe to call repeatedly. */
export async function loadContextWindows(): Promise<ContextWindows> {
  if (cache) return cache;
  try {
    cache = await invoke<ContextWindows>("kode_model_context_windows");
  } catch {
    cache = {};
  }
  return cache;
}

/**
 * Context budget for the meter and auto-compaction: for Kode models, the size
 * chosen in the reasoning/context picker (capped to the model's window).
 */
export function getContextWindow(
  modelId: string,
  windows: ContextWindows,
  chosen: number | null = null,
): number {
  const kodeModel = getKodeModelById(modelId);
  if (kodeModel) return kodeContextBudget(kodeModel, chosen);
  return windows[modelId] ?? DEFAULT_WINDOW;
}
