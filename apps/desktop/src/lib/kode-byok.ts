// Your own API keys (BYOK) for Kode's Anthropic / OpenAI / Agent Router models.
//
// Keys go one way: from Settings into the OS keychain (src-tauri lib.rs,
// kode_byok_set_key). The web view never reads them back; Rust reads them
// itself when it sends a request. Only whether a key is set, and the
// non-secret Agent Router base URL, come back here.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

export type ByokProvider = "anthropic" | "openai" | "agent_router";

type ByokKeyStatus = { provider: string; configured: boolean };

const BYOK_CHANGED_EVENT = "kode-byok-changed";
const DEFAULT_AGENT_ROUTER_URL = "https://co.agentrouter.org";

// Older builds also kept keys in localStorage, in plain text.
const LEGACY_PREFIXES = {
  key: "kode-byok-key-",
  baseUrl: "kode-byok-base-url-",
  systemKey: "kode-byok-system-key-",
} as const;

function setSecret(name: string, value: string): Promise<void> {
  return invoke("kode_byok_set_key", { provider: name, apiKey: value });
}

export async function saveByokKey(
  provider: ByokProvider,
  apiKey: string,
  baseUrl?: string,
  systemKey?: string,
): Promise<void> {
  const cleanKey = apiKey.trim();
  if (cleanKey.length < 8) throw new Error("API key must be at least 8 characters.");
  try {
    await setSecret(provider, cleanKey);
    if (provider === "agent_router") {
      if (baseUrl?.trim()) await setSecret("agent_router_base_url", baseUrl.trim());
      if (systemKey?.trim()) await setSecret("agent_router_system_key", systemKey.trim());
    }
  } catch (error) {
    // No plain-text fallback: a key that can't go in the keychain isn't saved.
    throw new Error(`Couldn't save the key in your keychain: ${String(error)}`);
  }
  notifyByokChanged();
}

/** Agent Router's base URL and system key, keeping the saved API key. */
export async function saveAgentRouterExtras(baseUrl?: string, systemKey?: string): Promise<void> {
  try {
    if (baseUrl?.trim()) await setSecret("agent_router_base_url", baseUrl.trim());
    if (systemKey?.trim()) await setSecret("agent_router_system_key", systemKey.trim());
  } catch (error) {
    throw new Error(`Couldn't save to your keychain: ${String(error)}`);
  }
  notifyByokChanged();
}

export async function removeByokKey(provider: ByokProvider): Promise<void> {
  const names = provider === "agent_router" ? [provider, "agent_router_base_url", "agent_router_system_key"] : [provider];
  for (const name of names) await invoke("kode_byok_remove_key", { provider: name });
  clearLegacy(provider);
  notifyByokChanged();
}

/** The Agent Router base URL (not a secret, so Settings can show it). */
export async function getAgentRouterBaseUrl(): Promise<string> {
  const url = await invoke<string | null>("kode_byok_get_setting", { name: "agent_router_base_url" }).catch(() => null);
  return url?.trim() || DEFAULT_AGENT_ROUTER_URL;
}

/** Which keys are saved: providers, plus "agent_router_system_key". */
async function loadByokStatus(): Promise<Set<string>> {
  await migrateLegacyKeys();
  const statuses = await invoke<ByokKeyStatus[]>("kode_byok_status").catch(() => []);
  return new Set(statuses.filter((status) => status.configured).map((status) => status.provider));
}

function clearLegacy(provider: ByokProvider) {
  try {
    for (const prefix of Object.values(LEGACY_PREFIXES)) localStorage.removeItem(prefix + provider);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

let migration: Promise<void> | null = null;

/** Move keys an older build left in localStorage into the keychain, once. */
function migrateLegacyKeys(): Promise<void> {
  migration ??= (async () => {
    for (const provider of ["anthropic", "openai", "agent_router"] as ByokProvider[]) {
      let key: string | null = null;
      let baseUrl: string | null = null;
      let systemKey: string | null = null;
      try {
        key = localStorage.getItem(LEGACY_PREFIXES.key + provider);
        baseUrl = localStorage.getItem(LEGACY_PREFIXES.baseUrl + provider);
        systemKey = localStorage.getItem(LEGACY_PREFIXES.systemKey + provider);
      } catch {
        return;
      }
      if (!key && !baseUrl && !systemKey) continue;
      try {
        if (key && key.trim().length >= 8) await setSecret(provider, key.trim());
        if (provider === "agent_router" && baseUrl?.trim()) await setSecret("agent_router_base_url", baseUrl.trim());
        if (provider === "agent_router" && systemKey?.trim()) await setSecret("agent_router_system_key", systemKey.trim());
        clearLegacy(provider);
      } catch {
        // Keychain unavailable: leave it for the next launch rather than lose it.
      }
    }
  })();
  return migration;
}

export function notifyByokChanged() {
  window.dispatchEvent(new Event(BYOK_CHANGED_EVENT));
}

/** Saved keys, kept fresh when Settings changes them. */
export function useByokStatus(): Set<string> {
  const [status, setStatus] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void loadByokStatus().then((next) => {
        if (!cancelled) setStatus(next);
      });
    };
    refresh();
    window.addEventListener(BYOK_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(BYOK_CHANGED_EVENT, refresh);
    };
  }, []);
  return status;
}

/** Providers with a saved key. */
export function useByokProviders(): Set<ByokProvider> {
  const status = useByokStatus();
  return useMemo(
    () => new Set((["anthropic", "openai", "agent_router"] as ByokProvider[]).filter((p) => status.has(p))),
    [status],
  );
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
  // Agent Router unlocks only these models.
  if (providers.has("agent_router") && AGENT_ROUTER_SUPPORTED_MODELS.has(modelId)) return true;
  const provider = providerForByokModel(modelId);
  return provider !== null && providers.has(provider);
}
