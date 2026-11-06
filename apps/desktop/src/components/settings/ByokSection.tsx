import { KeyRound, Loader2, Trash2, Eye, EyeOff, Check, Globe, ShieldCheck } from "lucide-react";
import { useState, useEffect } from "react";

import {
  saveByokKey,
  removeByokKey,
  getStoredByokKey,
  getStoredBaseUrl,
  getStoredSystemKey,
  useByokProviders,
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
  const configured = useByokProviders();

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
  const [savedSystemKey, setSavedSystemKey] = useState("");

  // Track saved key values to determine dirty state
  const [savedKeys, setSavedKeys] = useState<Record<ByokProvider, string>>({
    anthropic: "",
    openai: "",
    agent_router: "",
  });

  // Password visibility toggle
  const [showPassword, setShowPassword] = useState<Record<ByokProvider, boolean>>({
    anthropic: false,
    openai: false,
    agent_router: false,
  });

  const [busy, setBusy] = useState<ByokProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load stored keys on mount and whenever provider status changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const loaded: Record<ByokProvider, string> = {
        anthropic: "",
        openai: "",
        agent_router: "",
      };
      for (const p of PROVIDERS) {
        const stored = await getStoredByokKey(p.id);
        if (stored) {
          loaded[p.id] = stored;
        }
      }
      const url = await getStoredBaseUrl("agent_router");
      const sys = await getStoredSystemKey("agent_router");

      if (!cancelled) {
        setKeys(loaded);
        setSavedKeys(loaded);
        if (url) {
          setBaseUrl(url);
          setSavedBaseUrl(url);
        }
        if (sys) {
          setSystemKey(sys);
          setSavedSystemKey(sys);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const save = async (provider: ByokProvider) => {
    const rawVal = keys[provider].trim();
    if (!rawVal) return;

    setError(null);
    setBusy(provider);
    try {
      const urlToSave = provider === "agent_router" ? baseUrl : undefined;
      const sysToSave = provider === "agent_router" ? systemKey : undefined;
      await saveByokKey(provider, rawVal, urlToSave, sysToSave);
      setSavedKeys((current) => ({ ...current, [provider]: rawVal }));
      if (urlToSave) setSavedBaseUrl(urlToSave);
      if (sysToSave !== undefined) setSavedSystemKey(sysToSave);
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
      setSavedKeys((current) => ({ ...current, [provider]: "" }));
      if (provider === "agent_router") {
        setSystemKey("");
        setSavedSystemKey("");
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
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Add keys from Anthropic, OpenAI or Agent Router to use your own quota in
          Kode. Keys are kept in your Mac's keychain and are never sent to Kontinue
          servers.
        </p>
      </div>
      )}

      <div className="space-y-3">
        {shown.map((provider) => {
          const isConfigured = configured.has(provider.id) || !!savedKeys[provider.id];
          const isBusy = busy === provider.id;
          const currentVal = keys[provider.id];
          const savedVal = savedKeys[provider.id];
          const isVisible = showPassword[provider.id];

          // Key is dirty if entered text differs from saved key, base URL, or system key changed
          const isKeyDirty = currentVal.trim().length >= 8 && currentVal.trim() !== savedVal;
          const isUrlDirty = provider.id === "agent_router" && baseUrl.trim() !== savedBaseUrl;
          const isSysDirty = provider.id === "agent_router" && systemKey.trim() !== savedSystemKey;
          const isDirty = isKeyDirty || (isConfigured && (isUrlDirty || isSysDirty));

          return (
            <section
              key={provider.id}
              className="liquid-glass-dropdown !rounded-[20px] space-y-3 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-[13px] font-semibold text-foreground">{provider.name}</h4>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">{provider.hint}</p>
                </div>
                {isConfigured ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-emerald-500">
                    <Check size={12} /> Connected
                  </span>
                ) : null}
              </div>

              {/* Agent Router Base URL & System Access Key fields */}
              {provider.id === "agent_router" && (
                <>
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-[11px] font-medium text-foreground/70">
                      <span className="flex items-center gap-1.5"><Globe size={12} className="text-brand" /> API Base URL</span>
                      <span className="text-[10px] text-foreground/45">Provided by your Agent Router host</span>
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://co.agentrouter.org"
                      className="kontinue-3d h-8 w-full rounded-full px-3.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-[11px] font-medium text-foreground/70">
                      <span className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-brand" /> System Access Key</span>
                      <span className="text-[10px] text-foreground/45">Bypasses WAF client security checks</span>
                    </label>
                    <input
                      type="text"
                      value={systemKey}
                      onChange={(e) => setSystemKey(e.target.value)}
                      placeholder="e.g. P3euDB1k5areVnMQIg0TXYNoCPuGcCw="
                      className="kontinue-3d h-8 w-full rounded-full px-3.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60"
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
                    placeholder={`Paste ${provider.name} key`}
                    className="kontinue-3d h-8 w-full rounded-full px-3.5 pr-9 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60"
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
                  className="kontinue-3d-primary flex h-8 min-w-16 shrink-0 cursor-pointer items-center justify-center rounded-full px-3.5 text-[12px] font-medium disabled:cursor-default disabled:opacity-40"
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
      {error ? <p className="px-1 text-[12px] text-rose-400">{error}</p> : null}
    </div>
  );
}
