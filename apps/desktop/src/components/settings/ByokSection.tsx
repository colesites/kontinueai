import { KeyRound, Loader2, Trash2, Eye, EyeOff, Check, Globe, ShieldCheck } from "lucide-react";
import { useState, useEffect } from "react";

import {
  saveAgentRouterExtras,
  saveByokKey,
  removeByokKey,
  getAgentRouterBaseUrl,
  useByokStatus,
  type ByokProvider,
} from "@/lib/kode-byok";

const PROVIDERS: { id: ByokProvider; name: string; hint: string }[] = [
  { id: "anthropic", name: "Anthropic API", hint: "For direct Anthropic keys (sk-ant-...)" },
  { id: "openai", name: "OpenAI API", hint: "For direct OpenAI keys (sk-...)" },
  {
    id: "agent_router",
    name: "Agent Router / Custom Provider",
    hint: "Unlocks Claude Opus 5, Opus 4.8, & GPT 5.6 Sol via Agent Router key",
  },
];

/**
 * Standalone BYOK section — supports Direct Anthropic, Direct OpenAI, and
 * Agent Router / Custom API keys with persistent storage & base URL options.
 */
export function ByokSection({
  only,
  hideIntro = false,
}: {
  /** Show just these providers (Settings → Providers detail pane). */
  only?: ByokProvider[];
  hideIntro?: boolean;
} = {}) {
  const shown = only ? PROVIDERS.filter((p) => only.includes(p.id)) : PROVIDERS;
  // Only whether each key is saved comes back from the keychain, never the key.
  const status = useByokStatus();
  const configured = status;
  const systemKeySaved = status.has("agent_router_system_key");

  // Store current input values per provider
  const [keys, setKeys] = useState<Record<ByokProvider, string>>({
    anthropic: "",
    openai: "",
    agent_router: "",
  });

  // Base URL state for Agent Router / Custom API
  const [baseUrl, setBaseUrl] = useState("https://co.agentrouter.org");
  const [savedBaseUrl, setSavedBaseUrl] = useState("https://co.agentrouter.org");

  // System Access Key state for Agent Router
  const [systemKey, setSystemKey] = useState("");


  // Password visibility toggle
  const [showPassword, setShowPassword] = useState<Record<ByokProvider, boolean>>({
    anthropic: false,
    openai: false,
    agent_router: false,
  });

  const [busy, setBusy] = useState<ByokProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The base URL isn't secret, so it is shown; keys never are.
  useEffect(() => {
    let cancelled = false;
    void getAgentRouterBaseUrl().then((url) => {
      if (cancelled) return;
      setBaseUrl(url);
      setSavedBaseUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const save = async (provider: ByokProvider) => {
    const rawVal = keys[provider].trim();
    // Agent Router's URL or system key can change without re-entering the key.
    const extrasOnly = !rawVal && provider === "agent_router" && configured.has(provider);
    if (!rawVal && !extrasOnly) return;

    setError(null);
    setBusy(provider);
    try {
      const urlToSave = provider === "agent_router" ? baseUrl : undefined;
      const sysToSave = provider === "agent_router" ? systemKey : undefined;
      if (extrasOnly) await saveAgentRouterExtras(urlToSave, sysToSave);
      else await saveByokKey(provider, rawVal, urlToSave, sysToSave);
      // Saved in the keychain: clear the fields instead of holding the secret.
      setKeys((current) => ({ ...current, [provider]: "" }));
      if (urlToSave) setSavedBaseUrl(urlToSave);
      if (sysToSave !== undefined) setSystemKey("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (provider: ByokProvider) => {
    setError(null);
    setBusy(provider);
    try {
      await removeByokKey(provider);
      setKeys((current) => ({ ...current, [provider]: "" }));
      if (provider === "agent_router") {
        setSystemKey("");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const toggleVisibility = (provider: ByokProvider) => {
    setShowPassword((current) => ({
      ...current,
      [provider]: !current[provider],
    }));
  };

  return (
    <div className="space-y-4">
      {hideIntro ? null : (
      <div className="flex items-start gap-2.5 px-1">
        <KeyRound size={14} className="mt-0.5 shrink-0 text-purple-500" />
        <p className="text-label leading-relaxed text-muted-foreground">
          Add keys from Anthropic, OpenAI or Agent Router to use your own quota in
          Kode. Keys are kept in your Mac's keychain and are never sent to Kontinue
          servers.
        </p>
      </div>
      )}

      <div className="space-y-3">
        {shown.map((provider) => {
          const isConfigured = configured.has(provider.id);
          const isBusy = busy === provider.id;
          const currentVal = keys[provider.id];
          const isVisible = showPassword[provider.id];

          // Something new to save: a key, or a changed Agent Router setting.
          const isKeyDirty = currentVal.trim().length >= 8;
          const isUrlDirty = provider.id === "agent_router" && baseUrl.trim() !== savedBaseUrl;
          const isSysDirty = provider.id === "agent_router" && systemKey.trim().length > 0;
          const isDirty = isKeyDirty || (isConfigured && (isUrlDirty || isSysDirty));

          return (
            <section
              key={provider.id}
              className="liquid-glass-dropdown !rounded-[20px] space-y-3 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-body font-semibold text-foreground">{provider.name}</h4>
                  <p className="mt-0.5 text-label text-muted-foreground">{provider.hint}</p>
                </div>
                {isConfigured ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-label text-emerald-500">
                    <Check size={12} /> Connected
                  </span>
                ) : null}
              </div>

              {/* Agent Router Base URL & System Access Key fields */}
              {provider.id === "agent_router" && (
                <>
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-caption font-medium text-foreground/70">
                      <span className="flex items-center gap-1.5"><Globe size={12} className="text-brand" /> API Base URL</span>
                      <span className="text-micro text-foreground/45">Provided by your Agent Router host</span>
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://co.agentrouter.org"
                      className="kontinue-3d h-8 w-full rounded-full px-3.5 text-label text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-caption font-medium text-foreground/70">
                      <span className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-brand" /> System Access Key</span>
                      <span className="text-micro text-foreground/45">Bypasses WAF client security checks</span>
                    </label>
                    <input
                      type="password"
                      autoComplete="off"
                      value={systemKey}
                      onChange={(e) => setSystemKey(e.target.value)}
                      placeholder={systemKeySaved ? "Saved in your keychain. Paste a new one to replace it" : "Paste the system access key"}
                      className="kontinue-3d h-8 w-full rounded-full px-3.5 text-label text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={isVisible ? "text" : "password"}
                    autoComplete="off"
                    value={currentVal}
                    onChange={(event) =>
                      setKeys((current) => ({
                        ...current,
                        [provider.id]: event.target.value,
                      }))
                    }
                    placeholder={isConfigured ? "Saved in your keychain. Paste a new key to replace it" : `Paste ${provider.name} key`}
                    className="kontinue-3d h-8 w-full rounded-full px-3.5 pr-9 text-label text-foreground outline-none placeholder:text-muted-foreground/60"
                  />
                  {currentVal ? (
                    <button
                      type="button"
                      onClick={() => toggleVisibility(provider.id)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/45 hover:text-foreground transition-colors"
                      title={isVisible ? "Hide API key" : "Show API key"}
                    >
                      {isVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={isBusy || !isDirty}
                  onClick={() => void save(provider.id)}
                  className="kontinue-3d-primary flex h-8 min-w-16 shrink-0 cursor-pointer items-center justify-center rounded-full px-3.5 text-label font-medium disabled:cursor-default disabled:opacity-40"
                >
                  {isBusy ? <Loader2 size={14} className="animate-spin" /> : "Save"}
                </button>

                {isConfigured ? (
                  <button
                    type="button"
                    aria-label={`Remove ${provider.name} API key`}
                    title="Remove key"
                    disabled={isBusy}
                    onClick={() => void remove(provider.id)}
                    className="kontinue-3d flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-rose-500 disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {error ? <p className="px-1 text-label text-rose-400">{error}</p> : null}
    </div>
  );
}
