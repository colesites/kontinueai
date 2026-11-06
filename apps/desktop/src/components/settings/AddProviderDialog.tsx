// Settings → Providers → Add provider: a three-step dialog (Provider,
// Identity, Config) that adds a provider instance. You can add a second
// account of a built-in CLI (with its own config folder) or an ACP agent.

import { useMemo, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelSelectorLogo } from "@/components/chat/ModelPickerPopover";
import {
  ACP_PRESETS,
  INSTANCE_ID_PATTERN,
  addProvider,
  getProviders,
  kindName,
  newInstance,
  providerLogo,
  saveSecret,
  suggestInstanceId,
  type AcpPreset,
  type ProviderInstance,
  type ProviderKind,
} from "@/lib/kode-cli";
import type { ProviderVariable } from "@/lib/app-settings";

type Choice = { kind: ProviderKind; preset?: AcpPreset };

const CHOICES: (Choice & { note?: string })[] = [
  { kind: "claude" },
  { kind: "codex" },
  { kind: "cursor" },
  { kind: "acp", preset: "gemini" },
  { kind: "acp", preset: "opencode" },
  { kind: "acp", preset: "custom" },
];

const STEPS = ["Provider", "Identity", "Config"] as const;

export function AddProviderDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (id: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<Choice | null>(null);
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
    setError(null);
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const pick = (next: Choice) => {
    setChoice(next);
    const name = kindName(next);
    const existing = getProviders().filter((p) => p.kind === next.kind && p.preset === next.preset).length;
    setLabel(existing > 0 ? `${name} ${existing + 1}` : name);
    setId(suggestInstanceId(next.kind === "acp" ? next.preset ?? "agent" : next.kind));
    setCommand(next.kind === "acp" ? ACP_PRESETS[next.preset ?? "custom"].command : "");
    setAuthMethod(next.preset === "gemini" ? "oauth-personal" : "");
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
  const isGemini = choice?.preset === "gemini";
  const canNext =
    (step === 0 && !!choice) ||
    (step === 1 && !!label.trim() && !idError) ||
    (step === 2 && (!isAcp || !!command.trim()));

  const submit = async () => {
    if (!choice) return;
    setSaving(true);
    setError(null);
    try {
      const instance: ProviderInstance = newInstance(choice.kind, choice.preset, id, label.trim());
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
          const name = authMethod === "vertex-ai" ? "GOOGLE_API_KEY" : "GEMINI_API_KEY";
          await saveSecret(id, name, apiKey.trim());
          variables.push({ name, value: "", secret: true });
        }
        if (gcpProject.trim()) variables.push({ name: "GOOGLE_CLOUD_PROJECT", value: gcpProject.trim(), secret: false });
        if (gcpLocation.trim()) variables.push({ name: "GOOGLE_CLOUD_LOCATION", value: gcpLocation.trim(), secret: false });
        if (authMethod === "vertex-ai") variables.push({ name: "GOOGLE_GENAI_USE_VERTEXAI", value: "true", secret: false });
      }
      instance.variables = variables;
      addProvider(instance);
      onAdded(id);
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 supports-backdrop-filter:backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="liquid-glass-dropdown fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden !rounded-[22px] text-foreground outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="space-y-4 px-6 pt-5 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-[16px] font-semibold">Add provider</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-[12px] text-muted-foreground">
                  Add another account or an agent that runs on this computer.
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
                <li
                  key={name}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-full px-3 text-[12px]",
                    index === step ? "kontinue-capsule font-semibold" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border text-[10.5px]",
                      index < step ? "border-transparent bg-purple-600 text-white" : "border-current/30",
                    )}
                  >
                    {index < step ? <Check size={11} /> : index + 1}
                  </span>
                  {name}
                </li>
              ))}
            </ol>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-black/[0.05] px-6 py-5 dark:border-white/[0.06]">
            {step === 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {CHOICES.map((item) => {
                    const selected = choice?.kind === item.kind && choice?.preset === item.preset;
                    const logo = providerLogo(item);
                    return (
                      <button
                        key={`${item.kind}-${item.preset ?? ""}`}
                        type="button"
                        onClick={() => pick(item)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left transition-colors",
                          selected
                            ? "border-purple-500/70 bg-purple-500/10"
                            : "border-black/[0.06] hover:bg-black/[0.03] dark:border-white/[0.07] dark:hover:bg-white/[0.04]",
                        )}
                      >
                        {logo ? (
                          <ModelSelectorLogo provider={logo} className="size-4" />
                        ) : (
                          <span className="size-4 rounded bg-foreground/15" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-medium">{kindName(item)}</span>
                          <span className="block truncate text-[10.5px] text-muted-foreground">
                            {item.kind === "acp" ? ACP_PRESETS[item.preset ?? "custom"].description : "Another account or config folder"}
                          </span>
                        </span>
                        {selected ? <Check size={14} className="shrink-0 text-purple-500" /> : null}
                      </button>
                    );
                  })}
                  <div
                    title="Antigravity has no official headless mode. Third-party wrappers exist, but driving it from another app may break Google's terms."
                    className="flex items-center gap-2.5 rounded-2xl border border-dashed border-black/[0.08] px-3.5 py-3 opacity-60 dark:border-white/[0.08]"
                  >
                    <ModelSelectorLogo provider="google" className="size-4" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-medium">Antigravity</span>
                      <span className="block truncate text-[10.5px] text-muted-foreground">
                        No official headless mode yet. Use Gemini CLI.
                      </span>
                    </span>
                  </div>
                </div>
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
                        className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground"
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
                      <select
                        value={authMethod}
                        onChange={(e) => setAuthMethod(e.target.value)}
                        className="kontinue-3d h-8 w-full cursor-pointer rounded-full bg-transparent px-3 text-[12px] outline-none"
                      >
                        {ACP_PRESETS.gemini.authMethods?.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {authMethod !== "oauth-personal" ? (
                      <Field
                        label="API key"
                        description={authMethod === "vertex-ai" ? "Optional Vertex AI express key. Saved in your keychain." : "Gemini API key. Saved in your keychain."}
                      >
                        <TextInput value={apiKey} onChange={setApiKey} placeholder="Not set" password />
                      </Field>
                    ) : null}
                    <Field label="GCP project" description="Needed for Gemini Code Assist (Workspace) accounts and Vertex AI.">
                      <TextInput value={gcpProject} onChange={setGcpProject} placeholder="my-project-id" mono />
                    </Field>
                    {authMethod === "vertex-ai" ? (
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
            {error ? <p className="mt-3 text-[12px] text-rose-400">{error}</p> : null}
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
        <p className="text-[12.5px] font-medium">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        {error ? <p className="mt-0.5 text-[11px] text-rose-400">{error}</p> : null}
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
        "kontinue-3d h-8 w-full rounded-full px-3.5 text-[12px] outline-none placeholder:text-muted-foreground/50",
        mono && "font-mono text-[11.5px]",
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
        "h-8 cursor-pointer rounded-full px-4 text-[12px] font-medium disabled:cursor-default disabled:opacity-40",
        tone === "primary" ? "kontinue-3d-primary" : "kontinue-3d text-foreground/85 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
