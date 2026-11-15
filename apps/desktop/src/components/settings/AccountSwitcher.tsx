// Settings → Providers → Accounts: pick which account each provider uses
// (two Claude subscriptions, work and personal ChatGPT, …). Each account is a
// provider with its own config folder, so it keeps its own sign-in.

import { Check, Plus } from "lucide-react";
import { accountKey, activeAccountId, setActiveAccount } from "@/lib/kode-accounts";
import { kindName, type CliStatus, type ProviderInstance } from "@/lib/kode-cli";
import { cn } from "@/lib/utils";

export function AccountSwitcher({
  providers,
  active,
  statuses,
  onAdd,
}: {
  providers: ProviderInstance[];
  active: Record<string, string>;
  statuses: CliStatus[] | null;
  /** Add another account of the same provider as `like`. */
  onAdd: (like: ProviderInstance) => void;
}) {
  // Every provider you've added (custom commands are separate tools, not accounts).
  const keys = [...new Set(providers.map(accountKey))].filter((key) => key !== "acp:custom");
  if (keys.length === 0) return null;
  return (
    <section className="liquid-glass-dropdown !rounded-[20px] px-4 py-3.5">
      <p className="text-body font-medium text-foreground">Accounts</p>
      <p className="mt-0.5 text-label text-muted-foreground">
        Add another account of any provider (its own sign-in and config folder), then pick which one Kode uses. In a chat, type <code>/switch</code>.
      </p>
      <div className="mt-3 space-y-2.5">
        {keys.map((key) => {
          const accounts = providers.filter((p) => accountKey(p) === key);
          const activeId = activeAccountId(key, providers, active);
          return (
            <div key={key} className="flex flex-wrap items-center gap-1.5">
              <span className="w-28 shrink-0 text-label text-foreground/70">{kindName(accounts[0])}</span>
              {accounts.map((account) => {
                const status = statuses?.find((s) => s.instance === account.id);
                // A provider that's off isn't "in use", even if it's the default.
                const selected = account.id === activeId && account.enabled;
                return (
                  <button
                    key={account.id}
                    type="button"
                    disabled={!account.enabled}
                    onClick={() => setActiveAccount(account)}
                    title={account.enabled ? (status?.loggedIn === false ? "Not signed in" : `Use ${account.label}`) : "Turn this provider on first"}
                    className={cn(
                      "flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-label disabled:cursor-default disabled:opacity-45",
                      selected ? "kontinue-3d-primary font-medium" : "kontinue-3d text-foreground/75 hover:text-foreground",
                    )}
                  >
                    {selected ? <Check size={11} /> : <span className={cn("size-1.5 rounded-full", status?.loggedIn ? "bg-emerald-500" : status?.loggedIn === false ? "bg-amber-500" : "bg-foreground/25")} />}
                    {account.label}
                  </button>
                );
              })}
              <button type="button" onClick={() => onAdd(accounts[0])} className="flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-label text-muted-foreground hover:text-foreground">
                <Plus size={11} /> Add account
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
