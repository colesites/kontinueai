import { getModelById } from "@repo/ai/models";

const DEFAULT_MODEL_STORAGE_KEY = "kontinue.default-model";

export function readCachedDefaultModel(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const modelId = window.localStorage.getItem(DEFAULT_MODEL_STORAGE_KEY);
    return modelId && getModelById(modelId) ? modelId : null;
  } catch {
    return null;
  }
}

export function writeCachedDefaultModel(modelId: string | null): void {
  if (typeof window === "undefined") return;

  try {
    if (!modelId) {
      window.localStorage.removeItem(DEFAULT_MODEL_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(DEFAULT_MODEL_STORAGE_KEY, modelId);
  } catch {
    // Ignore storage failures; server persistence still handles the canonical value.
  }
}
