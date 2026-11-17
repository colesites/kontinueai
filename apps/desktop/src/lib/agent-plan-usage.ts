// Plan usage of the coding agents Kode runs on the user's own plans, shared by
// Settings → Usage → Your own plans and the composer's context popover.
//
// Claude Code and Codex are asked on this Mac (agent_usage.rs: a local
// `claude -p /usage` / `codex app-server`, which uses none of the plan).
// Cursor, Gemini CLI and Antigravity keep usage on their websites only.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProviderInstance } from "@/lib/app-settings";

export type UsageLimit = { label: string; percent: number; resetsAt: number | null };
export type AgentUsage = {
  id: string;
  label: string;
  kind: "claude" | "codex";
  plan: string | null;
  email: string | null;
  live: boolean;
  limits: UsageLimit[];
  asOf: number | null;
  note: string | null;
};

/** What agent_usage.rs needs to ask one account. */
export type UsageAccount = {
  id: string;
  label: string;
  kind: "claude" | "codex";
  homeDir: string;
  binaryPath: string;
};

/** Agents that keep no usage on this Mac: where to check instead. */
export const AGENT_DASHBOARDS: Record<string, { name: string; url: string }> = {
  cursor: { name: "Cursor", url: "https://cursor.com/dashboard?tab=usage" },
  gemini: { name: "Gemini CLI", url: "https://aistudio.google.com/usage" },
  antigravity: { name: "Antigravity", url: "https://antigravity.google/docs/plans" },
};

/** The account to ask for an instance, or null when it can't be asked here. */
export function usageAccount(instance: ProviderInstance): UsageAccount | null {
  if (instance.kind !== "claude" && instance.kind !== "codex") return null;
  return {
    id: instance.id,
    label: instance.label,
    kind: instance.kind,
    homeDir: instance.config.homeDir.trim(),
    binaryPath: instance.config.binaryPath.trim(),
  };
}

/** Where an instance's usage lives online, if it keeps none on this Mac. */
export function usageDashboard(instance: ProviderInstance): { name: string; url: string } | null {
  const key = instance.kind === "cursor" ? "cursor" : instance.kind === "acp" ? instance.preset ?? "" : "";
  return AGENT_DASHBOARDS[key] ?? null;
}

// Last answer per account, kept for the session so both places show a number
// at once and hovering the context meter doesn't start a CLI every time.
const cache = new Map<string, { usage: AgentUsage | null; at: number }>();
const FRESH_MS = 60_000;

export function cachedAgentUsage(id: string): AgentUsage | null | undefined {
  return cache.get(id)?.usage;
}

/** Ask the given accounts for their usage and remember the answers. */
export async function readAgentUsage(accounts: UsageAccount[]): Promise<AgentUsage[]> {
  const usage = await invoke<AgentUsage[]>("settings_agent_usage", { accounts });
  const at = Date.now();
  for (const account of accounts) {
    cache.set(account.id, { usage: usage.find((u) => u.id === account.id) ?? null, at });
  }
  return usage;
}

/**
 * One instance's usage while `active` (e.g. the popover is open). Shows the
 * last answer at once and asks again when it is more than a minute old.
 */
export function useInstancePlanUsage(instance: ProviderInstance | null, active: boolean) {
  const account = instance ? usageAccount(instance) : null;
  const key = account ? JSON.stringify(account) : "";
  const [usage, setUsage] = useState<AgentUsage | null | undefined>(() =>
    account ? cachedAgentUsage(account.id) : undefined,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account) return;
    const hit = cache.get(account.id);
    setUsage(hit?.usage);
    if (!active || (hit && Date.now() - hit.at < FRESH_MS)) return;
    let cancelled = false;
    setLoading(true);
    readAgentUsage([account])
      .then((list) => !cancelled && setUsage(list.find((u) => u.id === account.id) ?? null))
      .catch(() => !cancelled && setUsage(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // The account is compared by value (key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);

  return { usage, loading };
}
