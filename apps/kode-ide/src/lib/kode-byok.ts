import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

export type ByokProvider = "anthropic" | "openai" | "agent_router";

type ByokKeyStatus = {
  provider: ByokProvider;
  configured: boolean;
};

const BYOK_CHANGED_EVENT = "kode-byok-changed";
const LOCAL_STORAGE_PREFIX = "kode-byok-key-";
const LOCAL_STORAGE_BASE_URL_PREFIX = "kode-byok-base-url-";
const LOCAL_STORAGE_SYSTEM_KEY_PREFIX = "kode-byok-system-key-";

export async function saveByokKey(
  provider: ByokProvider,
  apiKey: string,
  baseUrl?: string,
  systemKey?: string
): Promise<void> {
  const cleanKey = apiKey.trim();
  if (cleanKey.length < 8) {
    throw new Error("API key must be at least 8 characters.");
  }

  // 1. Try saving to native OS keychain via Tauri
  try {
    await invoke("kode_byok_set_key", { provider, apiKey: cleanKey });
    if (baseUrl && provider === "agent_router") {
      await invoke("kode_byok_set_key", {
        provider: "agent_router_base_url",
        apiKey: baseUrl.trim(),
      });
    }
    if (systemKey !== undefined && provider === "agent_router") {
      await invoke("kode_byok_set_key", {
        provider: "agent_router_system_key",
        apiKey: systemKey.trim(),
      });
    }
  } catch (err) {
    console.warn("[byok] Tauri keychain set error (using local fallback):", err);
  }

  // 2. Always persist to localStorage fallback so keys never vanish
  try {
    localStorage.setItem(LOCAL_STORAGE_PREFIX + provider, cleanKey);
    if (baseUrl && provider === "agent_router") {
      localStorage.setItem(LOCAL_STORAGE_BASE_URL_PREFIX + provider, baseUrl.trim());
    }
    if (systemKey !== undefined && provider === "agent_router") {
      localStorage.setItem(LOCAL_STORAGE_SYSTEM_KEY_PREFIX + provider, systemKey.trim());
    }
  } catch {
    // ignore quota errors
  }

  notifyByokChanged();
}

export async function removeByokKey(provider: ByokProvider): Promise<void> {
  // 1. Try removing from native OS keychain
  try {
    await invoke("kode_byok_remove_key", { provider });
    if (provider === "agent_router") {
      await invoke("kode_byok_remove_key", { provider: "agent_router_base_url" });
      await invoke("kode_byok_remove_key", { provider: "agent_router_system_key" });
    }
  } catch (err) {
    console.warn("[byok] Tauri keychain remove error:", err);
  }

  // 2. Remove from localStorage fallback
  try {
    localStorage.removeItem(LOCAL_STORAGE_PREFIX + provider);
    if (provider === "agent_router") {
      localStorage.removeItem(LOCAL_STORAGE_BASE_URL_PREFIX + provider);
      localStorage.removeItem(LOCAL_STORAGE_SYSTEM_KEY_PREFIX + provider);
    }
  } catch {
    // ignore
  }

  notifyByokChanged();
}

export async function getStoredByokKey(provider: ByokProvider): Promise<string | null> {
  // 1. Try reading from native OS keychain
  try {
    const nativeKey = await invoke<string | null>("kode_byok_get_key", { provider });
    if (nativeKey && nativeKey.trim().length >= 8) {
      return nativeKey.trim();
    }
  } catch {
    // fall back
  }

  // 2. Fall back to localStorage
  try {
    const localKey = localStorage.getItem(LOCAL_STORAGE_PREFIX + provider);
    if (localKey && localKey.trim().length >= 8) {
      return localKey.trim();
    }
  } catch {
    // ignore
  }

  return null;
}

export async function getStoredBaseUrl(provider: ByokProvider): Promise<string> {
  if (provider !== "agent_router") return "";

  try {
    const nativeUrl = await invoke<string | null>("kode_byok_get_key", {
      provider: "agent_router_base_url",
    });
    if (nativeUrl && nativeUrl.trim().length > 0) return nativeUrl.trim();
  } catch {
    // ignore
  }

  try {
    const localUrl = localStorage.getItem(LOCAL_STORAGE_BASE_URL_PREFIX + provider);
    if (localUrl && localUrl.trim().length > 0) return localUrl.trim();
  } catch {
    // ignore
  }

  return "https://co.agentrouter.org";
}

export async function getStoredSystemKey(provider: ByokProvider): Promise<string> {
  if (provider !== "agent_router") return "";

  try {
    const nativeKey = await invoke<string | null>("kode_byok_get_key", {
      provider: "agent_router_system_key",
    });
    if (nativeKey && nativeKey.trim().length > 0) return nativeKey.trim();
  } catch {
    // ignore
  }

  try {
    const localKey = localStorage.getItem(LOCAL_STORAGE_SYSTEM_KEY_PREFIX + provider);
    if (localKey && localKey.trim().length > 0) return localKey.trim();
  } catch {
    // ignore
  }

  return "";
}

export async function loadByokProviders(): Promise<Set<ByokProvider>> {
  const result = new Set<ByokProvider>();

  // Check Tauri native keychain
  try {
    const statuses = await invoke<ByokKeyStatus[]>("kode_byok_status");
    for (const status of statuses) {
      if (status.configured) result.add(status.provider);
    }
  } catch {
    // ignore
  }

  // Check localStorage fallback
  for (const provider of ["anthropic", "openai", "agent_router"] as ByokProvider[]) {
    try {
      const val = localStorage.getItem(LOCAL_STORAGE_PREFIX + provider);
      if (val && val.trim().length >= 8) {
        result.add(provider);
      }
    } catch {
      // ignore
    }
  }

  return result;
}

export function notifyByokChanged() {
  window.dispatchEvent(new Event(BYOK_CHANGED_EVENT));
}

export function useByokProviders() {
  const [providers, setProviders] = useState<Set<ByokProvider>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void loadByokProviders()
        .then((next) => {
          if (!cancelled) setProviders(next);
        })
        .catch(() => {
          if (!cancelled) setProviders(new Set());
        });
    };
    refresh();
    window.addEventListener(BYOK_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(BYOK_CHANGED_EVENT, refresh);
    };
  }, []);

  return useMemo(() => providers, [providers]);
}

export function providerForByokModel(modelId: string): ByokProvider | null {
  if (modelId.startsWith("anthropic/")) return "anthropic";
  if (modelId.startsWith("openai/")) return "openai";
  return null;
}

export const AGENT_ROUTER_SUPPORTED_MODELS = new Set([
  "anthropic/claude-opus-5",
  "anthropic/claude-opus-4.8",
  "openai/gpt-5.6-sol",
]);

export function canUseByokModel(modelId: string, providers: Set<ByokProvider>) {
  // Agent Router ONLY unlocks the 3 specific supported models
  if (providers.has("agent_router") && AGENT_ROUTER_SUPPORTED_MODELS.has(modelId)) {
    return true;
  }

  const provider = providerForByokModel(modelId);
  return provider !== null && providers.has(provider);
}

export async function getActiveByokKeyForModel(
  modelId: string
): Promise<{ provider: ByokProvider; key: string } | null> {
  if (AGENT_ROUTER_SUPPORTED_MODELS.has(modelId)) {
    const arKey = await getStoredByokKey("agent_router");
    if (arKey) return { provider: "agent_router", key: arKey };
  }

  const provider = providerForByokModel(modelId);
  if (provider) {
    const key = await getStoredByokKey(provider);
    if (key) return { provider, key };
  }

  return null;
}
