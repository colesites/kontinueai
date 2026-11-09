// Several accounts of the same provider (two Claude subscriptions, a work and
// a personal ChatGPT, …). Each account is a provider instance with its own
// config folder, so it has its own sign-in. One account per provider is
// active: its models are the ones in the picker, and a chat on that provider
// runs on it. Switch in Settings → Providers or with `/switch` in a chat.

import { getSettings, updateSettings, type AppSettings, type ProviderInstance } from "./app-settings";

export type AccountGroup = {
  /** "claude", "codex", "cursor" or "acp:<preset>". */
  key: string;
  accounts: ProviderInstance[];
  activeId: string;
};

export function accountKey(instance: Pick<ProviderInstance, "kind" | "preset">): string {
  return instance.kind === "acp" ? `acp:${instance.preset ?? "custom"}` : instance.kind;
}

/** The active account of a group: the saved choice if still enabled, else the first enabled. */
export function activeAccountId(key: string, providers: ProviderInstance[], active: Record<string, string> = {}): string | null {
  const accounts = providers.filter((p) => accountKey(p) === key);
  const enabled = accounts.filter((p) => p.enabled);
  const saved = active[key];
  if (saved && enabled.some((p) => p.id === saved)) return saved;
  return (enabled[0] ?? accounts[0])?.id ?? null;
}

/** Providers with two or more accounts. Custom ACP agents are separate tools, not accounts. */
export function accountGroups(settings: Pick<AppSettings, "kodeProviders" | "kodeActiveAccounts">): AccountGroup[] {
  const providers = settings.kodeProviders ?? [];
  const keys = [...new Set(providers.map(accountKey))].filter((key) => key !== "acp:custom");
  return keys.flatMap((key) => {
    const accounts = providers.filter((p) => accountKey(p) === key);
    if (accounts.length < 2) return [];
    return [{ key, accounts, activeId: activeAccountId(key, providers, settings.kodeActiveAccounts) ?? accounts[0].id }];
  });
}

/** Whether an instance's models belong in the picker (only the active account's). */
export function isActiveAccount(instance: ProviderInstance, settings: Pick<AppSettings, "kodeProviders" | "kodeActiveAccounts">): boolean {
  if (accountKey(instance) === "acp:custom") return true;
  return activeAccountId(accountKey(instance), settings.kodeProviders ?? [], settings.kodeActiveAccounts) === instance.id;
}

export function setActiveAccount(instance: Pick<ProviderInstance, "id" | "kind" | "preset">) {
  const current = getSettings().kodeActiveAccounts ?? {};
  updateSettings({ kodeActiveAccounts: { ...current, [accountKey(instance)]: instance.id } });
}

/**
 * Which account `/switch <query>` means: by id or label (exact, then
 * prefix, then contains). An empty query cycles to the next account.
 */
export function resolveSwitchTarget(group: AccountGroup, currentId: string, query: string): ProviderInstance | null {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const q = norm(query.trim()).replace(/^-|-$/g, "");
  const accounts = group.accounts.filter((a) => a.enabled);
  if (accounts.length === 0) return null;
  if (!q) {
    const index = accounts.findIndex((a) => a.id === currentId);
    return accounts[(index + 1) % accounts.length] ?? null;
  }
  const by = (test: (value: string) => boolean) => accounts.find((a) => test(norm(a.id)) || test(norm(a.label)));
  return by((v) => v === q) ?? by((v) => v.startsWith(q)) ?? by((v) => v.includes(q)) ?? null;
}

/** The same model on another account: "cli:claude:opus" → "cli:claude-work:opus". */
export function modelOnAccount(modelId: string, instanceId: string): string | null {
  const match = modelId.match(/^cli:[^:]+:(.+)$/);
  return match ? `cli:${instanceId}:${match[1]}` : null;
}

/**
 * Whether a Claude Code or Codex transcript belongs to this account, so the
 * account can resume (or fork) that exact session: Claude Code keeps them in
 * <config dir>/projects, Codex in <home>/sessions.
 */
export function nativeSessionBelongsTo(
  provider: string,
  sourcePath: string | undefined,
  instance: Pick<ProviderInstance, "kind" | "config">,
  home = "",
): boolean {
  if (provider === "codex") return codexThreadBelongsTo(sourcePath, instance, home);
  if (provider !== "claude_code" || !sourcePath || instance.kind !== "claude") return false;
  const configured = instance.config.homeDir.trim().replace(/^~(?=\/|$)/, home).replace(/\/+$/, "");
  if (configured) return sourcePath.startsWith(`${configured}/`);
  return /[\\/]\.claude[\\/]projects[\\/]/.test(sourcePath);
}

/**
 * Whether a Codex transcript lives in this account's Codex home, so the
 * account can resume that exact thread (`codex exec resume <id>`).
 */
export function codexThreadBelongsTo(
  sourcePath: string | undefined,
  instance: Pick<ProviderInstance, "kind" | "config">,
  home = "",
): boolean {
  if (!sourcePath || instance.kind !== "codex") return false;
  const configured = instance.config.homeDir.trim().replace(/^~(?=\/|$)/, home).replace(/\/+$/, "");
  if (configured) return sourcePath.startsWith(`${configured}/`);
  return /[\\/]\.codex[\\/]sessions[\\/]/.test(sourcePath);
}
