// Settings → Providers → Add provider: a three-step dialog (Provider,
// Identity, Config) that adds a provider instance. Pick a known provider
// (a second account of a built-in CLI, or a known ACP agent), any agent from
// the ACP Registry, or your own ACP command.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ExternalLink, Loader2, Search, SquareTerminal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelSelectorLogo } from "@/components/chat/ModelPickerPopover";
import { Select } from "./settings-ui";
import {
  ACP_PRESETS,
  INSTANCE_ID_PATTERN,
  addProvider,
  getProviders,
  kindName,
  loadAcpRegistry,
  managedAgentId,
  newInstance,
  providerLogo,
  registryLaunch,
  saveSecret,
  suggestInstanceId,
  type AcpPreset,
  type AcpRegistry,
  type ProviderInstance,
  type ProviderKind,
  type RegistryAgent,
} from "@/lib/kode-cli";
import type { ProviderVariable, RegistryRef } from "@/lib/app-settings";

type Choice = { kind: ProviderKind; preset?: AcpPreset; registry?: RegistryRef; command?: string };

/** Featured providers, shown as tiles. Everything else comes from the registry list. */
const TILES: Choice[] = [
  { kind: "claude" },
  { kind: "codex" },
  { kind: "cursor" },
  { kind: "acp", preset: "gemini" },
  { kind: "acp", preset: "antigravity" },
  { kind: "acp", preset: "opencode" },
  { kind: "acp", preset: "copilot" },
  { kind: "acp", preset: "qwen" },
];

/** Registry agents already offered as a tile. */
const TILE_REGISTRY_IDS = new Set(["gemini", "antigravity-acp", "opencode", "github-copilot-cli", "qwen-code", "cursor"]);

const tileDescription = (item: Choice) =>
  item.kind === "acp" ? ACP_PRESETS[item.preset ?? "custom"].description : "Another account or config folder.";

const sameChoice = (a: Choice | null, b: Choice) =>
  !!a && a.kind === b.kind && a.preset === b.preset && a.registry?.id === b.registry?.id;

const STEPS = ["Provider", "Identity", "Config"] as const;

export function AddProviderDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `installAgentId`: a registry download to start installing right away. */
  onAdded: (id: string, installAgentId?: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [registry, setRegistry] = useState<AcpRegistry | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [accent, setAccent] = useState<string | null>(null);
  // Config
  const [homeDir, setHomeDir] = useState("");
  const [binaryPath, setBinaryPath] = useState("");
  const [command, setCommand] = useState("");
  const [launchArgs, setLaunchArgs] = useState("");
  const [authMethod, setAuthMethod] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [gcpProject, setGcpProject] = useState("");
  const [gcpLocation, setGcpLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep(0);
    setChoice(null);
    setLabel("");
    setId("");
    setAccent(null);
    setHomeDir("");
    setBinaryPath("");
    setCommand("");
    setLaunchArgs("");
    setAuthMethod("");
    setApiKey("");
    setGcpProject("");
    setGcpLocation("");
    setQuery("");
    setError(null);
  };

  const fetchRegistry = () => {
    setRegistryError(null);
    loadAcpRegistry()
      .then(setRegistry)
      .catch((reason: unknown) => setRegistryError(reason instanceof Error ? reason.message : String(reason)));
  };
  // Load when the dialog opens; the index is cached for the session.
  useEffect(() => {
    if (open && !registry) fetchRegistry();
  }, [open]);

  const registryAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (registry?.agents ?? [])
      .filter((agent) => !TILE_REGISTRY_IDS.has(agent.id))
      .filter((agent) => !q || agent.name.toLowerCase().includes(q) || agent.description.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [registry, query]);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const pick = (next: Choice) => {
    // A preset the app downloads: use the registry's command for this computer.
    const presetRegistryId = next.kind === "acp" && !next.registry ? ACP_PRESETS[next.preset ?? "custom"].registryId : undefined;
    const presetAgent = presetRegistryId ? registry?.agents.find((a) => a.id === presetRegistryId) : undefined;
    const presetLaunch = presetAgent && registry ? registryLaunch(presetAgent, registry.platform) : null;
    setChoice(next);
    const name = kindName(next);
    const existing = getProviders().filter(
      (p) => p.kind === next.kind && p.preset === next.preset && p.registry?.id === next.registry?.id,
    ).length;
    setLabel(existing > 0 ? `${name} ${existing + 1}` : name);
    setId(suggestInstanceId(next.registry?.id.replace(/-acp$/, "") ?? (next.kind === "acp" ? next.preset ?? "agent" : next.kind)));
    setCommand(
      next.kind !== "acp" ? "" : next.command ?? presetLaunch?.command ?? ACP_PRESETS[next.preset ?? "custom"].command,
    );
    setAuthMethod(ACP_PRESETS[next.preset ?? "custom"].authMethods && !next.registry ? "oauth-personal" : "");
  };

  const pickRegistry = (agent: RegistryAgent) => {
    const launch = registry ? registryLaunch(agent, registry.platform) : null;
    if (!launch) return;
    pick({ kind: "acp", preset: "custom", registry: launch.ref, command: launch.command });
    setStep(1);
  };

  const idTaken = useMemo(() => getProviders().some((p) => p.id === id), [id]);
  const idError = !id
    ? "Required."
    : !INSTANCE_ID_PATTERN.test(id)
      ? "Use letters, digits, '-' or '_'."
      : idTaken
        ? "Another provider uses this id."
        : null;

  const isAcp = choice?.kind === "acp";
  const authMethods = isAcp && !choice?.registry ? ACP_PRESETS[choice?.preset ?? "custom"].authMethods : undefined;
  const isGemini = !!authMethods;
  const usesCloud = authMethod === "vertex-ai" || authMethod === "agent-platform";
  const canNext =
    (step === 0 && !!choice) ||
    (step === 1 && !!label.trim() && !idError) ||
    (step === 2 && (!isAcp || !!command.trim()));

  // Tabs: any step before this one, or the next ones once their earlier steps are filled in.
  const canOpenStep = (index: number) =>
    index <= step || (index >= 1 && !!choice && (index === 1 || (!!label.trim() && !idError)));

  const submit = async () => {
    if (!choice) return;
    setSaving(true);
    setError(null);
    try {
      const instance: ProviderInstance = newInstance(choice.kind, choice.preset, id, label.trim());
      if (choice.registry) instance.registry = choice.registry;
      instance.accent = accent;
      instance.config = {
        ...instance.config,
        homeDir: homeDir.trim(),
        binaryPath: binaryPath.trim(),
        command: isAcp ? command.trim() : "",
        launchArgs: launchArgs.trim(),
        authMethod,
      };
      const variables: ProviderVariable[] = [];
      if (isGemini) {
        if (apiKey.trim()) {
          const name = usesCloud ? "GOOGLE_API_KEY" : "GEMINI_API_KEY";
          await saveSecret(id, name, apiKey.trim());
          variables.push({ name, value: "", secret: true });
        }
        if (gcpProject.trim()) variables.push({ name: "GOOGLE_CLOUD_PROJECT", value: gcpProject.trim(), secret: false });
        if (gcpLocation.trim()) variables.push({ name: "GOOGLE_CLOUD_LOCATION", value: gcpLocation.trim(), secret: false });
        if (usesCloud) variables.push({ name: "GOOGLE_GENAI_USE_VERTEXAI", value: "true", secret: false });
      }
      instance.variables = variables;
      addProvider(instance);
      onAdded(id, managedAgentId(instance) ?? undefined);
      close(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 kontinue-scrim data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="liquid-glass-dropdown fixed top-1/2 left-1/2 z-50 flex h-[min(760px,88vh)] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden !rounded-[22px] text-foreground outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="space-y-4 px-6 pt-5 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-[16px] font-semibold">Add provider</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-label text-muted-foreground">
                  Add another account, a known agent, or any agent from the ACP Registry.
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close"
                className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </Dialog.Close>
            </div>
            <ol className="kontinue-3d grid grid-cols-3 gap-1 rounded-full p-1">
              {STEPS.map((name, index) => (
                <li key={name}>
                <button
                  type="button"
                  disabled={!canOpenStep(index)}
                  onClick={() => setStep(index)}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-full px-3 text-label",
                    index === step
                      ? "kontinue-capsule font-semibold"
                      : "kontinue-hover cursor-pointer text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-60 disabled:hover:text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border text-caption",
                      index < step ? "border-transparent bg-purple-600 text-white" : "border-current/30",
                    )}
                  >
                    {index < step ? <Check size={11} /> : index + 1}
                  </span>
                  {name}
                </button>
                </li>
              ))}
            </ol>
          </div>

          <div
            className={cn(
              "min-h-0 flex-1 border-t border-black/[0.05] px-6 py-5 dark:border-white/[0.06]",
              // Step 1 keeps the providers in place and scrolls only the registry list.
              step === 0 ? "flex flex-col" : "overflow-y-auto",
            )}
          >
            {step === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col gap-5">
                <section className="shrink-0 space-y-2.5">
                  <SectionLabel>Provider</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {TILES.map((item) => {
                      const selected = sameChoice(choice, item);
                      const logo = providerLogo(item);
                      return (
                        <button
                          key={`${item.kind}-${item.preset ?? ""}`}
                          type="button"
                          title={tileDescription(item)}
                          onClick={() => pick(item)}
                          className={cn(
                            "group flex h-12 cursor-pointer items-center gap-3 px-3 text-left transition-all active:scale-[0.99]",
                            selected ? "kontinue-capsule !rounded-[18px]" : "liquid-glass-card rounded-[18px]",
                          )}
                        >
                          <ProviderBadge small>
                            {logo ? (
                              <ModelSelectorLogo provider={logo} className="size-3.5" />
                            ) : (
                              <span className="size-3 rounded-full bg-foreground/25" />
                            )}
                          </ProviderBadge>
                          <span className="min-w-0 flex-1 truncate text-body font-medium text-zinc-800 dark:text-zinc-100">
                            {kindName(item)}
                          </span>
                          {selected ? (
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white">
                              <Check size={11} strokeWidth={3} />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <div className="flex shrink-0 items-center gap-3 text-caption text-muted-foreground">
                  <span className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.07]" />
                  Or choose from the ACP Registry
                  <span className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.07]" />
                </div>

                <section className="flex min-h-0 flex-1 flex-col gap-2.5">
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="kontinue-3d flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full px-3.5 text-muted-foreground focus-within:text-foreground">
                      <Search size={13} className="shrink-0" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search agents…"
                        spellCheck={false}
                        className="min-w-0 flex-1 bg-transparent text-label text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                    </label>
                    <button
                      type="button"
                      title={ACP_PRESETS.custom.description}
                      onClick={() => {
                        pick({ kind: "acp", preset: "custom" });
                        setStep(1);
                      }}
                      className="kontinue-3d flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-label font-medium text-foreground/85 hover:text-foreground"
                    >
                      <SquareTerminal size={13} /> Your own command
                    </button>
                  </div>

                  <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
                  {registryError ? (
                    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-dashed border-black/[0.08] px-4 py-3 text-label text-muted-foreground dark:border-white/[0.08]">
                      <span className="min-w-0">Couldn't load the ACP Registry. {registryError}</span>
                      <DialogButton onClick={fetchRegistry}>Retry</DialogButton>
                    </div>
                  ) : !registry ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-label text-muted-foreground">
                      <Loader2 size={13} className="animate-spin" /> Loading the ACP Registry…
                    </div>
                  ) : registryAgents.length === 0 ? (
                    <p className="py-8 text-center text-label text-muted-foreground">No agents match "{query.trim()}".</p>
                  ) : (
                    <ul className="-mx-2 space-y-0.5">
                      {registryAgents.map((agent) => {
                        const launch = registryLaunch(agent, registry.platform);
                        const link = agent.website ?? agent.repository;
                        return (
                          <li
                            key={agent.id}
                            className="kontinue-hover group flex items-center gap-3 rounded-[18px] px-2 py-2"
                          >
                            <ProviderBadge>
                              {agent.icon ? (
                                <ModelSelectorLogo provider={agent.icon} className="size-4" />
                              ) : (
                                <span className="size-3.5 rounded-full bg-foreground/25" />
                              )}
                            </ProviderBadge>
                            <div className="min-w-0 flex-1">
                              <p className="flex items-baseline gap-1.5">
                                <span className="truncate text-body font-medium text-zinc-800 dark:text-zinc-100">{agent.name}</span>
                                <span className="shrink-0 font-mono text-micro text-muted-foreground/70">v{agent.version}</span>
                              </p>
                              <p title={agent.description} className="truncate text-label text-muted-foreground">
                                {agent.description}
                              </p>
                            </div>
                            {link ? (
                              <button
                                type="button"
                                title={`Open ${link.replace(/^https?:\/\//, "")}`}
                                onClick={() => void openUrl(link)}
                                className="kontinue-hover flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLink size={12} />
                              </button>
                            ) : null}
                            {launch ? (
                              <button
                                type="button"
                                title={launch.ref.binary ? "Kontinue downloads and updates it for you." : `Runs ${launch.command}`}
                                onClick={() => pickRegistry(agent)}
                                className="kontinue-3d h-7 shrink-0 cursor-pointer rounded-full px-3 text-label font-medium text-foreground/85 hover:text-foreground"
                              >
                                Add
                              </button>
                            ) : (
                              <span
                                title="This agent has no download for this computer."
                                className="shrink-0 px-2 text-caption text-muted-foreground/70"
                              >
                                Not available
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  </div>
                </section>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
                <Field label="Label" description="Shown in the provider list and model picker.">
                  <TextInput value={label} onChange={setLabel} placeholder="Claude Code (work)" />
                </Field>
                <Field label="Instance ID" description="Letters, digits, '-' or '_'. Can't be changed later." error={id ? idError : null}>
                  <TextInput value={id} onChange={setId} mono />
                </Field>
                <Field label="Accent color" description="Optional marker shown in the picker.">
                  <div className="flex items-center gap-2">
                    {accent ? (
                      <button
                        type="button"
                        onClick={() => setAccent(null)}
                        className="cursor-pointer text-caption text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    ) : null}
                    <label className="kontinue-3d relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full">
                      <span
                        className="size-4 rounded-full ring-1 ring-foreground/20"
                        style={{ backgroundColor: accent ?? "transparent" }}
                      />
                      <input
                        type="color"
                        value={accent ?? "#7c3aed"}
                        onChange={(e) => setAccent(e.target.value)}
                        className="absolute inset-0 cursor-pointer opacity-0"
                        aria-label="Accent color"
                      />
                    </label>
                  </div>
                </Field>
              </div>
            ) : null}

            {step === 2 && choice ? (
              <div className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
                {isGemini ? (
                  <>
                    <Field
                      label="Sign-in method"
                      description="A Google account uses your subscription; API keys and Vertex AI bill usage."
                    >
                      <Select
                        value={authMethod}
                        onChange={setAuthMethod}
                        minWidth={240}
                        options={(authMethods ?? []).map((m) => ({ value: m.id, label: m.label, description: m.description }))}
                      />
                    </Field>
                    {!authMethod.startsWith("oauth") ? (
                      <Field
                        label="API key"
                        description={usesCloud ? "Optional Vertex AI express key. Saved in your keychain." : "Gemini API key. Saved in your keychain."}
                      >
                        <TextInput value={apiKey} onChange={setApiKey} placeholder="Not set" password />
                      </Field>
                    ) : null}
                    <Field label="GCP project" description="Needed for Gemini Code Assist (Workspace) accounts and Vertex AI.">
                      <TextInput value={gcpProject} onChange={setGcpProject} placeholder="my-project-id" mono />
                    </Field>
                    {usesCloud ? (
                      <Field label="GCP location" description="Region for Vertex AI.">
                        <TextInput value={gcpLocation} onChange={setGcpLocation} placeholder="us-central1" mono />
                      </Field>
                    ) : null}
                  </>
                ) : null}
                {isAcp ? (
                  <Field
                    label="Command"
                    description="Starts the agent in ACP mode. The first word is the program."
                    error={!command.trim() ? "Required." : null}
                  >
                    <TextInput value={command} onChange={setCommand} placeholder="my-agent --acp" mono />
                  </Field>
                ) : null}
                {choice.kind === "claude" || choice.kind === "codex" ? (
                  <Field
                    label={choice.kind === "claude" ? "Config folder (CLAUDE_CONFIG_DIR)" : "CODEX_HOME"}
                    description="A separate folder keeps this account's sign-in apart from the default one."
                  >
                    <TextInput
                      value={homeDir}
                      onChange={setHomeDir}
                      placeholder={choice.kind === "claude" ? "~/.claude-work" : "~/.codex-work"}
                      mono
                    />
                  </Field>
                ) : null}
                {!isAcp ? (
                  <Field label="Binary path" description="Leave empty to find it on your PATH.">
                    <TextInput value={binaryPath} onChange={setBinaryPath} placeholder="Automatic" mono />
                  </Field>
                ) : null}
                <Field label="Launch arguments" description="Extra arguments added to every turn.">
                  <TextInput value={launchArgs} onChange={setLaunchArgs} placeholder="Optional" mono />
                </Field>
              </div>
            ) : null}
            {error ? <p className="mt-3 text-label text-rose-400">{error}</p> : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-black/[0.05] px-6 py-3.5 dark:border-white/[0.06]">
            {step === 0 ? (
              <DialogButton onClick={() => close(false)}>Cancel</DialogButton>
            ) : (
              <DialogButton onClick={() => setStep(step - 1)}>Back</DialogButton>
            )}
            {step < 2 ? (
              <DialogButton tone="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                Next
              </DialogButton>
            ) : (
              <DialogButton tone="primary" disabled={!canNext || saving} onClick={() => void submit()}>
                {saving ? "Adding…" : "Add provider"}
              </DialogButton>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  description,
  error,
  children,
}: {
  label: string;
  description: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-body font-medium">{label}</p>
        <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">{description}</p>
        {error ? <p className="mt-0.5 text-caption text-rose-400">{error}</p> : null}
      </div>
      <div className="w-[240px] shrink-0">{children}</div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  password,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  password?: boolean;
}) {
  return (
    <input
      value={value}
      type={password ? "password" : "text"}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "kontinue-3d h-8 w-full rounded-full px-3.5 text-label outline-none placeholder:text-muted-foreground/50",
        mono && "font-mono text-label",
      )}
    />
  );
}

function DialogButton({
  children,
  onClick,
  disabled,
  tone = "neutral",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "primary";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 cursor-pointer rounded-full px-4 text-label font-medium disabled:cursor-default disabled:opacity-40",
        tone === "primary" ? "kontinue-3d-primary" : "kontinue-3d text-foreground/85 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-label font-semibold text-foreground/85">{children}</p>;
}

// Logo circle, same as the starter cards on Home and Kode.
function ProviderBadge({ children, small }: { children: ReactNode; small?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-purple-500/20 bg-purple-500/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] transition-transform group-hover:scale-105 dark:bg-purple-500/15",
        small ? "size-7" : "size-9",
      )}
    >
      {children}
    </span>
  );
}
