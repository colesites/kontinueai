// Per-model context window resolution. Windows come from OpenRouter (its slugs)
// and the Vercel AI Gateway (MiniMax), fetched once via Rust and cached. The
// meter's denominator follows the SELECTED model, so switching models changes it
// (e.g. Kode 1.0 → 262K, GPT 5.5 → its own window).

import { invoke } from "@tauri-apps/api/core";
import { KODE_MODEL_ID, KODE_PRIMARY_MODEL } from "@repo/ai/lib/kode";

// Used only if a fetch fails or a slug is missing from the catalogs.
const DEFAULT_WINDOW = 128_000;
const FALLBACK: Record<string, number> = {
  // Kode 1.0 is Gemma 4 under the hood (262K) — covers the offline/first-run case.
  [KODE_MODEL_ID]: 262_144,
  [KODE_PRIMARY_MODEL]: 262_144,
};

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

// Kode 1.0 is branded — resolve it to its real underlying slug for lookup.
function underlyingSlug(modelId: string): string {
  return modelId === KODE_MODEL_ID ? KODE_PRIMARY_MODEL : modelId;
}

export function getContextWindow(
  modelId: string,
  windows: ContextWindows,
): number {
  const slug = underlyingSlug(modelId);
  return windows[slug] ?? FALLBACK[modelId] ?? FALLBACK[slug] ?? DEFAULT_WINDOW;
}
