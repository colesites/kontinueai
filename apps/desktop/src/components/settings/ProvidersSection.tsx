// Settings → Providers.
//
// The user's own agents: Claude Code, Codex and Cursor (built in) plus any
// they add (another account, Gemini CLI, OpenCode, a custom ACP agent). When
// a provider is on, its enabled models show in Kode's model picker and run
// through that agent on this computer (the user's plan, not Kode usage).
// Kode's own models are unaffected; the API keys section below holds the
// user's own keys for them.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  Loader2,
  Lock,
  LockOpen,
  LogIn,
  LogOut,
  Minus,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ModelSelectorLogo } from "@/components/chat/ModelPickerPopover";
import { cn } from "@/lib/utils";
import {
  updateSettings,
  useAppSettings,
  type CliConfigSetting,
  type ProviderVariable,
} from "@/lib/app-settings";
import {
  ACP_PRESETS,
  cliLoginCommand,
  cliModelCatalog,
  cliPlanLabel,
  cliVersionIssue,
  getProvider,
  installUrl,
  kindName,
  managedAgentId,
  loadInstanceModels,
  providerLogo,
  refreshCliProviders,
  removeProvider,
  removeSecret,
  saveSecret,
  secretStatus,
  startCliTask,
  updateProvider,
  useCliStore,
  type CliStatus,
  type CliStore,
  type CliTask,
  type ProviderInstance,
} from "@/lib/kode-cli";
import { AddProviderDialog } from "./AddProviderDialog";
import { AccountSwitcher } from "./AccountSwitcher";
import { Select } from "./settings-ui";

type TaskState = {
  label: string;
  lines: string[];
  running: boolean;
  result?: { ok: boolean; text: string };
  cancel?: () => void;
};

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/;

function timeAgo(at: number | null, now: number): string {
  if (!at) return "Not checked yet";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "Checked just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Checked ${minutes}m ago`;
  return `Checked ${Math.round(minutes / 60)}h ago`;
}

function statusLine(status: CliStatus | undefined, checking: boolean) {
  if (!status) return { text: checking ? "Checking…" : "Not checked", tone: "off" as const };
  if (!status.installed) return { text: status.error ?? "Not found", tone: "bad" as const };
  if (status.loggedIn === false) return { text: "Not signed in", tone: "warn" as const };
  if (status.loggedIn) return { text: "Signed in", tone: "ok" as const };
  return { text: "Installed", tone: "ok" as const };
}

export function ProvidersSection() {
  const settings = useAppSettings();
  const store = useCliStore();
  const providers = settings.kodeProviders;
  const [selected, setSelected] = useState<string>(() => providers[0]?.id ?? "claude");
  const [adding, setAdding] = useState(false);
  const [tasks, setTasks] = useState<Record<string, TaskState>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const statusOf = (id: string) => store.statuses?.find((s) => s.instance === id);
  const current = providers.find((p) => p.id === selected) ?? providers[0];

  const runTask = (instance: ProviderInstance, task: CliTask, label: string) => {
    const id = instance.id;
    const handle = startCliTask(instance, task, (line) =>
      setTasks((all) => {
        const prev = all[id];
        if (!prev) return all;
        return { ...all, [id]: { ...prev, lines: [...prev.lines, line].slice(-200) } };
      }),
    );
    setTasks((all) => ({ ...all, [id]: { label, lines: [], running: true, cancel: handle.cancel } }));
    return handle.done
      .then((result) => ({
        ok: result.success,
        text: result.stopped ? "Stopped." : result.success ? "Done." : "Did not finish. See the output above.",
      }))
      .catch((error: unknown) => ({ ok: false, text: error instanceof Error ? error.message : String(error) }))
      .then((result) => {
        setTasks((all) => ({ ...all, [id]: { ...(all[id] as TaskState), running: false, result, cancel: undefined } }));
        // A finished run tidies itself away; failures stay until closed.
        if (result.ok) window.setTimeout(() => dismissTask(id, true), 4000);
      });
  };

  const dismissTask = (id: string, onlyIfDone = false) =>
    setTasks((all) => {
      const task = all[id];
      if (!task || task.running || (onlyIfDone && !task.result?.ok)) return all;
      const { [id]: _gone, ...rest } = all;
      return rest;
    });

  const updateAll = async () => {
    // One update per CLI binary is enough (several accounts can share one).
    const seen = new Set<string>();
    for (const instance of providers) {
      const status = statusOf(instance.id);
      if (!status?.installed || !status.updateCommand || !status.path || seen.has(status.path)) continue;
      seen.add(status.path);
      if (!tasks[instance.id]?.running) {
        await runTask(instance, { kind: "update" }, `Updating ${instance.label}`);
      }
    }
  };

  const anyUpdatable = store.statuses?.some((s) => s.installed && s.updateCommand) ?? false;
  const anyRunning = Object.values(tasks).some((t) => t.running);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 px-1">
        <p className="text-label text-muted-foreground">
          Turn on a provider to add its models to Kode's model picker. They run on this computer
          with your own plan and are not counted in Kode usage.
        </p>
        <div className="flex shrink-0 items-center gap-3 text-label">
          <button
            type="button"
            disabled={!anyUpdatable || anyRunning}
            onClick={() => void updateAll()}
            className="cursor-pointer text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-40"
          >
            Update all
          </button>
          <button
            type="button"
            onClick={() => void refreshCliProviders()}
            className="flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground"
            title="Check again"
          >
            <RefreshCw size={11} className={cn(store.checking && "animate-spin")} />
            {store.checking ? "Checking…" : timeAgo(store.checkedAt, now)}
          </button>
        </div>
      </div>

      <AccountSwitcher providers={providers} active={settings.kodeActiveAccounts ?? {}} statuses={store.statuses} onAdd={() => setAdding(true)} />

      <section className="liquid-glass-dropdown flex min-h-[540px] overflow-hidden !rounded-[20px]">
        {/* Instance list */}
        <div className="flex w-[250px] shrink-0 flex-col border-r border-black/[0.05] dark:border-white/[0.06]">
          {providers.map((instance) => {
            const status = statusOf(instance.id);
            const line = statusLine(status, store.checking);
            return (
              <ListItem
                key={instance.id}
                active={current?.id === instance.id}
                onSelect={() => setSelected(instance.id)}
                logo={providerLogo(instance)}
                accent={instance.accent}
                title={instance.label}
                line={line.text}
                tone={line.tone}
                trailing={
                  <Switch
                    checked={instance.enabled && !!status?.installed}
                    disabled={!status?.installed}
                    aria-label={`Use ${instance.label} models in Kode`}
                    onCheckedChange={(checked) => {
                      updateProvider(instance.id, { enabled: checked });
                      // ACP agents list their models from a session; load them now.
                      if (checked && instance.kind === "acp") {
                        const latest = getProvider(instance.id);
                        if (latest) void loadInstanceModels(latest);
                      }
                    }}
                  />
                }
              />
            );
          })}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex cursor-pointer items-center gap-2.5 px-3.5 py-3 text-body text-muted-foreground transition-colors kontinue-hover hover:text-foreground"
          >
            <span className="flex size-7 items-center justify-center">
              <Plus size={14} />
            </span>
            Add provider
          </button>
        </div>

        {/* Detail */}
        <div className="min-w-0 flex-1 p-5">
          {current ? (
            <InstanceDetail
              key={current.id}
              instance={current}
              status={statusOf(current.id)}
              store={store}
              task={tasks[current.id]}
              onTask={(task, label) => void runTask(current, task, label)}
              onDismissTask={() => dismissTask(current.id)}
              onRemoved={() => setSelected(providers[0]?.id ?? "claude")}
            />
          ) : null}
        </div>
      </section>

      <section>
        <SubHeading>Advanced</SubHeading>
        <div className="liquid-glass-dropdown mt-2 flex items-center justify-between gap-6 !rounded-[20px] px-4 py-3">
          <div className="min-w-0">
            <p className="text-body font-medium text-foreground/90">Health check interval</p>
            <p className="mt-0.5 text-label text-muted-foreground">
              Re-check install, version, sign-in and models in the background. Set to 0 to turn off.
            </p>
          </div>
          <IntervalStepper
            value={settings.kodeCliHealthInterval ?? 300}
            onChange={(value) => {
              updateSettings({ kodeCliHealthInterval: value });
              void refreshCliProviders();
            }}
          />
        </div>
      </section>

      <AddProviderDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={(id, installAgentId) => {
          setSelected(id);
          // Registry downloads start installing straight away.
          const added = getProvider(id);
          if (installAgentId && added) {
            void runTask(added, { kind: "install", agentId: installAgentId }, `Installing ${kindName(added)}`);
          }
        }}
      />
    </div>
  );
}

function ProviderLogo({ logo, accent, className }: { logo: string; accent?: string | null; className?: string }) {
  return (
    <span className={cn("kontinue-3d relative flex size-7 shrink-0 items-center justify-center rounded-full", className)}>
      {logo ? (
        <ModelSelectorLogo provider={logo} className="size-3.5" />
      ) : (
        <span className="size-3 rounded-sm bg-foreground/25" />
      )}
      {accent ? (
        <span
          className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-background"
          style={{ backgroundColor: accent }}
        />
      ) : null}
    </span>
  );
}

function ListItem({
  active,
  onSelect,
  logo,
  accent,
  title,
  line,
  tone,
  trailing,
}: {
  active: boolean;
  onSelect: () => void;
  logo: string;
  accent?: string | null;
  title: string;
  line: string;
  tone: DotTone;
  trailing?: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 border-b border-black/[0.04] px-3.5 py-3 transition-colors dark:border-white/[0.04]",
        active ? "bg-black/[0.04] dark:bg-white/[0.05]" : "kontinue-hover",
      )}
    >
      <ProviderLogo logo={logo} accent={accent} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-foreground/90">{title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-caption leading-snug text-muted-foreground">
          <Dot tone={tone} />
          <span className="line-clamp-2">{line}</span>
        </p>
      </div>
      {trailing ? (
        <span onClick={(e) => e.stopPropagation()} className="pt-0.5">
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

function InstanceDetail({
  instance,
  status,
  store,
  task,
  onTask,
  onDismissTask,
  onRemoved,
}: {
  instance: ProviderInstance;
  status: CliStatus | undefined;
  store: CliStore;
  task: TaskState | undefined;
  onTask: (task: CliTask, label: string) => void;
  onDismissTask: () => void;
  onRemoved: () => void;
}) {
  const line = statusLine(status, store.checking && !store.statuses);
  const busy = !!task?.running;
  const installed = !!status?.installed;
  const loginCommand = cliLoginCommand(instance);
  const isAcp = instance.kind === "acp";
  const managedId = managedAgentId(instance);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="flex items-center gap-2 text-lead font-semibold">
            <ProviderLogo logo={providerLogo(instance)} accent={instance.accent} className="size-6" />
            <span className="truncate">{instance.label}</span>
            {status?.version ? (
              <span className="font-mono text-caption font-normal text-muted-foreground">v{status.version}</span>
            ) : null}
          </h3>
          <p className="flex items-center gap-1.5 text-label text-muted-foreground">
            <Dot tone={line.tone} />
            {line.text}
            {instance.label !== kindName(instance) ? ` · ${kindName(instance)}` : ""}
            {status?.installMethod && status.installMethod !== "unknown" ? ` · ${status.installMethod}` : ""}
          </p>
          {status?.path ? (
            <p className="truncate font-mono text-caption text-muted-foreground/80" title={status.path}>
              {status.path}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {!installed && !(store.checking && !store.statuses) ? (
            managedId ? (
              <SmallButton
                tone="primary"
                disabled={busy}
                onClick={() => onTask({ kind: "install", agentId: managedId }, `Installing ${kindName(instance)}`)}
              >
                <Download size={11} /> Install
              </SmallButton>
            ) : (
              <SmallButton onClick={() => void openUrl(installUrl(instance))}>
                Install <ExternalLink size={10} className="opacity-60" />
              </SmallButton>
            )
          ) : null}
          {installed && status?.loggedIn !== true ? (
            <SmallButton
              tone={status?.loggedIn === false ? "primary" : "neutral"}
              disabled={busy}
              onClick={() => onTask({ kind: "login" }, `Signing in to ${instance.label}`)}
            >
              <LogIn size={11} /> Sign in
            </SmallButton>
          ) : null}
          {installed && status?.loggedIn === true ? (
            <SmallButton disabled={busy} onClick={() => onTask({ kind: "logout" }, `Signing out of ${instance.label}`)}>
              <LogOut size={11} /> Sign out
            </SmallButton>
          ) : null}
          {installed && status?.updateCommand ? (
            <SmallButton
              disabled={busy}
              title={`Runs: ${status.updateCommand}`}
              onClick={() => onTask({ kind: "update" }, `Updating ${instance.label}`)}
            >
              <Download size={11} /> Update
            </SmallButton>
          ) : null}
        </div>
      </div>

      {installed && status?.loggedIn === false && !task ? (
        <p className="text-label text-muted-foreground">
          Sign in opens your browser.
          {loginCommand ? (
            <>
              {" "}You can also run <code className="font-mono">{loginCommand}</code> in a terminal.
            </>
          ) : null}
        </p>
      ) : null}

      {task ? <TaskLog task={task} onDismiss={onDismissTask} /> : null}

      {/* Models */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <SubHeading>Models</SubHeading>
          {(isAcp || instance.kind === "cursor") && instance.enabled && installed ? (
            <button
              type="button"
              onClick={() => void loadInstanceModels(instance)}
              className="flex cursor-pointer items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
            >
              <RefreshCw size={10} /> Load models
            </button>
          ) : null}
        </div>
        {instance.enabled && installed ? (
          <ModelList instance={instance} store={store} signedOut={status?.loggedIn === false} />
        ) : (
          <p className="liquid-glass-dropdown !rounded-[16px] px-4 py-3 text-label text-muted-foreground">
            {installed
              ? `Turn ${instance.label} on in the list to choose which of its models show in Kode's model picker. ${cliPlanLabel(instance)}.`
              : `Install ${kindName(instance)} to use it in Kode.`}
          </p>
        )}
      </div>

      {/* Display */}
      <div className="space-y-2">
        <SubHeading>Display</SubHeading>
        <div className="liquid-glass-dropdown divide-y divide-black/[0.05] !rounded-[16px] dark:divide-white/[0.05]">
          <DraftField
            label="Label"
            description="Shown in the provider list and as the model picker group."
            value={instance.label}
            placeholder={kindName(instance)}
            onCommit={(value) => updateProvider(instance.id, { label: value || kindName(instance) })}
          />
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-label font-medium text-foreground/90">Accent color</p>
              <p className="text-caption text-muted-foreground">Optional marker shown in the picker.</p>
            </div>
            <div className="flex items-center gap-2">
              {instance.accent ? (
                <button
                  type="button"
                  onClick={() => updateProvider(instance.id, { accent: null })}
                  className="cursor-pointer text-caption text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              ) : null}
              <label className="kontinue-3d relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full">
                <span
                  className="size-4 rounded-full ring-1 ring-foreground/20"
                  style={{ backgroundColor: instance.accent ?? "transparent" }}
                />
                <input
                  type="color"
                  value={instance.accent ?? "#7c3aed"}
                  onChange={(e) => updateProvider(instance.id, { accent: e.target.value })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Accent color"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Variables */}
      <VariablesEditor instance={instance} />

      {/* Runtime */}
      <div className="space-y-2">
        <SubHeading>Runtime</SubHeading>
        <div className="liquid-glass-dropdown divide-y divide-black/[0.05] !rounded-[16px] dark:divide-white/[0.05]">
          {isAcp ? (
            <ConfigField
              instance={instance}
              field="command"
              label="Command"
              description="Starts the agent in ACP mode. The first word is the program."
              placeholder={ACP_PRESETS[instance.preset ?? "custom"].command || "my-agent --acp"}
            />
          ) : null}
          {isAcp && ACP_PRESETS[instance.preset ?? "custom"].authMethods ? (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-label font-medium text-foreground/90">Sign-in method</p>
                <p className="text-caption text-muted-foreground">Used by Sign in.</p>
              </div>
              <Select
                value={instance.config.authMethod || (ACP_PRESETS[instance.preset ?? "custom"].authMethods?.[0]?.id ?? "")}
                onChange={(authMethod) => updateProvider(instance.id, { config: { ...instance.config, authMethod } })}
                minWidth={200}
                options={(ACP_PRESETS[instance.preset ?? "custom"].authMethods ?? []).map((m) => ({
                  value: m.id,
                  label: m.label,
                  description: m.description,
                }))}
              />
            </div>
          ) : null}
          <ConfigField
            instance={instance}
            field="binaryPath"
            label="Binary path"
            description={
              isAcp
                ? "Overrides the command's program. Leave empty to use the command as typed."
                : `Command or full path for ${kindName(instance)}. Leave empty to find it on your PATH.`
            }
            placeholder="Automatic"
          />
          {instance.kind === "claude" || instance.kind === "codex" ? (
            <ConfigField
              instance={instance}
              field="homeDir"
              label={instance.kind === "claude" ? "Config folder (CLAUDE_CONFIG_DIR)" : "CODEX_HOME"}
              description="Use a separate config and sign-in folder, for example a second account."
              placeholder={instance.kind === "claude" ? "~/.claude" : "~/.codex"}
            />
          ) : null}
          <ConfigField
            instance={instance}
            field="launchArgs"
            label="Launch arguments"
            description="Extra arguments added every time it starts."
            placeholder="Optional"
          />
        </div>
      </div>

      {!instance.builtIn ? (
        <div className="flex items-center justify-between gap-4 px-1">
          <p className="text-label text-muted-foreground">
            Removes this provider and its saved secrets. The CLI and its own sign-in stay on this computer.
          </p>
          {confirmRemove ? (
            <span className="flex shrink-0 items-center gap-1.5">
              <SmallButton onClick={() => setConfirmRemove(false)}>Cancel</SmallButton>
              <SmallButton
                tone="danger"
                onClick={() => {
                  removeProvider(instance.id);
                  onRemoved();
                }}
              >
                Remove
              </SmallButton>
            </span>
          ) : (
            <SmallButton tone="danger" onClick={() => setConfirmRemove(true)}>
              <Trash2 size={11} /> Remove
            </SmallButton>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ModelList({
  instance,
  store,
  signedOut,
}: {
  instance: ProviderInstance;
  store: CliStore;
  signedOut: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");

  const catalog = cliModelCatalog(instance, store.accountModels);
  const disabled = new Set(instance.models.disabled);
  const query = filter.trim().toLowerCase();
  const shown = query
    ? catalog.filter((m) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query))
    : catalog;
  const enabledCount = catalog.filter((m) => !disabled.has(m.id)).length;
  const allOn = enabledCount === catalog.length;
  const loadError = store.modelErrors[instance.id];

  // Read the latest instance so quick successive toggles are not lost.
  const saveModels = (patch: Partial<ProviderInstance["models"]>) => {
    const latest = getProvider(instance.id) ?? instance;
    updateProvider(instance.id, { models: { ...latest.models, ...patch } });
  };

  const toggle = (id: string, on: boolean) => {
    const next = new Set((getProvider(instance.id) ?? instance).models.disabled);
    if (on) next.delete(id);
    else next.add(id);
    saveModels({ disabled: [...next] });
  };

  const addCustom = () => {
    const id = newId.trim();
    if (!id) return;
    const latest = getProvider(instance.id) ?? instance;
    saveModels({
      custom: [...latest.models.custom.filter((m) => m.id !== id), { id, name: newName.trim() || id }],
      disabled: latest.models.disabled.filter((d) => d !== id),
    });
    setNewId("");
    setNewName("");
    setAdding(false);
  };

  const removeCustom = (id: string) => {
    const latest = getProvider(instance.id) ?? instance;
    saveModels({
      custom: latest.models.custom.filter((m) => m.id !== id),
      disabled: latest.models.disabled.filter((d) => d !== id),
    });
  };

  return (
    <div className="liquid-glass-dropdown space-y-2 !rounded-[16px] px-4 py-3">
      <div className="flex items-center gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter models"
          className="kontinue-3d h-7 min-w-0 flex-1 rounded-full px-3 text-label outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          disabled={catalog.length === 0}
          onClick={() => saveModels({ disabled: allOn ? catalog.map((m) => m.id) : [] })}
          className="cursor-pointer text-caption text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          {allOn ? "Disable all" : "Enable all"}
        </button>
        <span className="text-caption text-muted-foreground/70">
          {enabledCount}/{catalog.length} on
        </span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex cursor-pointer items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
        >
          <Plus size={11} /> Custom
        </button>
      </div>

      {adding ? (
        <div className="flex items-center gap-2">
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder={instance.kind === "claude" ? "Model id, e.g. claude-opus-5-5" : "Model id"}
            spellCheck={false}
            className="kontinue-3d h-7 min-w-0 flex-1 rounded-full px-3 font-mono text-caption outline-none placeholder:text-muted-foreground/60"
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (optional)"
            className="kontinue-3d h-7 w-36 rounded-full px-3 text-caption outline-none placeholder:text-muted-foreground/60"
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
          />
          <SmallButton tone="primary" disabled={!newId.trim()} onClick={addCustom}>
            Add
          </SmallButton>
        </div>
      ) : null}

      {loadError ? (
        <p className="flex items-start gap-1.5 text-caption text-amber-600 dark:text-amber-400">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          Could not load models: {loadError}
        </p>
      ) : null}

      {catalog.length === 0 ? (
        <p className="py-3 text-label text-muted-foreground">
          {instance.kind === "cursor" && signedOut
            ? "Sign in to load the models on your Cursor account."
            : "No models found. Add one by id with Custom."}
        </p>
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          {shown.map((model) => {
            const on = !disabled.has(model.id);
            const issue = cliVersionIssue(model.id, instance, store.statuses);
            return (
              <div key={model.id} className="flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2 text-label">
                    <span className="truncate text-foreground/90">{model.name}</span>
                    <span className="truncate font-mono text-caption text-muted-foreground/70">{model.id}</span>
                  </p>
                  {issue ? (
                    <p className="flex items-center gap-1 text-caption text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={10} /> {issue}
                    </p>
                  ) : null}
                </div>
                {model.tags?.length ? (
                  <span className="hidden shrink-0 text-caption text-muted-foreground/70 md:inline">
                    {model.tags.join(" · ")}
                  </span>
                ) : null}
                {model.custom ? (
                  <button
                    type="button"
                    aria-label={`Remove ${model.name}`}
                    onClick={() => removeCustom(model.id)}
                    className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-rose-400"
                  >
                    <X size={11} />
                  </button>
                ) : null}
                <Switch checked={on} onCheckedChange={(checked) => toggle(model.id, checked)} />
              </div>
            );
          })}
          {shown.length === 0 ? (
            <p className="py-3 text-label text-muted-foreground">No models match “{filter}”.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Names that usually hold secrets start locked (stored in the keychain).
const LOOKS_SECRET = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i;

type DraftRow = { key: number; name: string; value: string; secret: boolean; error?: string };

/**
 * Environment variables for one provider: set on the CLI's process each time
 * Kode starts it (for example ANTHROPIC_API_KEY to use an API key instead of
 * the subscription, or ANTHROPIC_BASE_URL for a proxy). Locked values are
 * written to the keychain and only read by the app's Rust side when starting
 * the CLI; they never come back to this screen.
 */
function VariablesEditor({ instance }: { instance: ProviderInstance }) {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const nextKey = useRef(1);

  const secretNames = useMemo(
    () => instance.variables.filter((v) => v.secret).map((v) => v.name),
    [instance.variables],
  );
  const refreshSaved = () =>
    secretStatus(instance.id, secretNames).then((flags) =>
      setSaved(Object.fromEntries(secretNames.map((n, i) => [n, flags[i] ?? false]))),
    );
  useEffect(() => {
    void refreshSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id, secretNames]);

  const latestVariables = () => (getProvider(instance.id) ?? instance).variables;
  const putVariable = (variable: ProviderVariable) =>
    updateProvider(instance.id, {
      variables: [...latestVariables().filter((v) => v.name !== variable.name), variable],
    });

  const addDraft = () =>
    setDrafts((rows) => [...rows, { key: nextKey.current++, name: "", value: "", secret: false }]);
  const patchDraft = (key: number, patch: Partial<DraftRow>) =>
    setDrafts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const dropDraft = (key: number) => setDrafts((rows) => rows.filter((r) => r.key !== key));

  // Save a new row once it has a valid name and a value.
  const commitDraft = async (row: DraftRow) => {
    const name = row.name.trim();
    if (!name || !row.value) return;
    if (!VARIABLE_NAME.test(name)) {
      patchDraft(row.key, { error: "Use letters, digits and _ (not starting with a digit)." });
      return;
    }
    try {
      if (row.secret) await saveSecret(instance.id, name, row.value);
      putVariable({ name, value: row.secret ? "" : row.value, secret: row.secret });
      dropDraft(row.key);
      void refreshSaved();
    } catch (reason) {
      patchDraft(row.key, { error: reason instanceof Error ? reason.message : String(reason) });
    }
  };

  // Saved rows: a new value replaces the old one.
  const commitValue = async (variable: ProviderVariable, value: string) => {
    if (variable.secret) {
      if (!value) return; // left empty: keep the stored secret
      await saveSecret(instance.id, variable.name, value);
      void refreshSaved();
    } else if (value !== variable.value) {
      putVariable({ ...variable, value });
    }
  };

  // Locking moves the value into the keychain; unlocking clears it (the app
  // cannot read a stored secret back), so it has to be typed again.
  const toggleLock = async (variable: ProviderVariable) => {
    if (variable.secret) {
      await removeSecret(instance.id, variable.name);
      putVariable({ ...variable, secret: false, value: "" });
    } else {
      if (variable.value) await saveSecret(instance.id, variable.name, variable.value);
      putVariable({ ...variable, secret: true, value: "" });
      void refreshSaved();
    }
  };

  const remove = (variable: ProviderVariable) => {
    if (variable.secret) void removeSecret(instance.id, variable.name);
    updateProvider(instance.id, { variables: latestVariables().filter((v) => v.name !== variable.name) });
  };

  return (
    <div className="space-y-2">
      <SubHeading>Environment</SubHeading>
      <div className="liquid-glass-dropdown space-y-3 !rounded-[16px] px-4 py-3.5">
        <div>
          <p className="text-body font-medium text-foreground/90">Variables</p>
          <p className="mt-0.5 text-label text-muted-foreground">
            API keys, base URLs, and other settings for this CLI. Applied each time it starts.
          </p>
        </div>

        <button
          type="button"
          onClick={addDraft}
          className="kontinue-3d flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-label font-medium text-foreground/85 hover:text-foreground"
        >
          <Plus size={12} /> Add variable
        </button>

        {instance.variables.length + drafts.length > 0 ? (
          <div className="space-y-2">
            {instance.variables.map((variable) => (
              <VariableRow
                key={`saved-${variable.name}`}
                name={variable.name}
                nameLocked
                value={variable.secret ? "" : variable.value}
                placeholder={
                  variable.secret ? (saved[variable.name] ? "•••••••• saved" : "Not saved, type a value") : "value"
                }
                secret={variable.secret}
                onValueCommit={(value) => void commitValue(variable, value)}
                onToggleLock={() => void toggleLock(variable)}
                onRemove={() => remove(variable)}
              />
            ))}
            {drafts.map((row) => (
              <div key={`draft-${row.key}`} className="space-y-1">
                <VariableRow
                  name={row.name}
                  value={row.value}
                  placeholder="value"
                  secret={row.secret}
                  autoFocus
                  onNameChange={(name) =>
                    patchDraft(row.key, {
                      name,
                      error: undefined,
                      // Suggest locking for names that look secret.
                      secret: row.secret || LOOKS_SECRET.test(name),
                    })
                  }
                  onValueChange={(value) => patchDraft(row.key, { value, error: undefined })}
                  onValueCommit={() => void commitDraft(row)}
                  onToggleLock={() => patchDraft(row.key, { secret: !row.secret })}
                  onRemove={() => dropDraft(row.key)}
                />
                {row.error ? <p className="px-1 text-caption text-rose-400">{row.error}</p> : null}
              </div>
            ))}
          </div>
        ) : null}

        <p className="text-caption text-muted-foreground">
          Locked values are stored in your keychain and never returned to the app.
        </p>
      </div>
    </div>
  );
}

function VariableRow({
  name,
  nameLocked,
  value,
  placeholder,
  secret,
  autoFocus,
  onNameChange,
  onValueChange,
  onValueCommit,
  onToggleLock,
  onRemove,
}: {
  name: string;
  nameLocked?: boolean;
  value: string;
  placeholder: string;
  secret: boolean;
  autoFocus?: boolean;
  onNameChange?: (name: string) => void;
  onValueChange?: (value: string) => void;
  onValueCommit: (value: string) => void;
  onToggleLock: () => void;
  onRemove: () => void;
}) {
  // Saved rows edit a local copy and commit on blur / Enter.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const current = onValueChange ? value : draft;

  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        readOnly={nameLocked}
        autoFocus={autoFocus}
        onChange={(e) => onNameChange?.(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
        placeholder="VARIABLE_NAME"
        spellCheck={false}
        className={cn(
          "kontinue-3d h-8 w-[38%] min-w-0 rounded-full px-3.5 font-mono text-label outline-none placeholder:text-muted-foreground/50",
          nameLocked && "text-foreground/80",
        )}
      />
      <span className="text-label text-muted-foreground">=</span>
      <input
        value={current}
        type={secret ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => (onValueChange ? onValueChange(e.target.value) : setDraft(e.target.value))}
        onBlur={() => onValueCommit(current)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={placeholder}
        className="kontinue-3d h-8 min-w-0 flex-1 rounded-full px-3.5 font-mono text-label outline-none placeholder:text-muted-foreground/50"
      />
      <button
        type="button"
        aria-label={secret ? "Stored as a secret. Click to store as plain text" : "Click to store as a secret"}
        title={secret ? "Secret: stored in your keychain" : "Plain text. Click to store in your keychain"}
        onClick={onToggleLock}
        className={cn(
          "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors",
          secret ? "text-foreground/85" : "text-muted-foreground/60 hover:text-foreground",
        )}
      >
        {secret ? <Lock size={13} /> : <LockOpen size={13} />}
      </button>
      <button
        type="button"
        aria-label="Remove variable"
        onClick={onRemove}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-rose-400"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function TaskLog({ task, onDismiss }: { task: TaskState; onDismiss: () => void }) {
  const ref = useRef<HTMLPreElement>(null);
  // Output stays open while running or after a failure; a success folds it away.
  const [showOutput, setShowOutput] = useState(true);
  useEffect(() => {
    if (task.result) setShowOutput(!task.result.ok);
  }, [task.result]);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [task.lines.length, showOutput]);
  const link = useMemo(() => {
    for (let i = task.lines.length - 1; i >= 0; i--) {
      const match = task.lines[i].match(URL_PATTERN);
      if (match) return match[0];
    }
    return null;
  }, [task.lines]);

  const state = task.running ? "running" : task.result?.ok ? "ok" : "failed";

  return (
    <div className="liquid-glass-card overflow-hidden rounded-[20px] animate-in fade-in-0 slide-in-from-top-1 duration-200">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border",
            state === "running" && "border-purple-500/25 bg-purple-500/10 text-purple-500 dark:text-purple-300",
            state === "ok" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-500",
            state === "failed" && "border-rose-500/25 bg-rose-500/10 text-rose-400",
          )}
        >
          {state === "running" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : state === "ok" ? (
            <Check size={11} strokeWidth={2.5} />
          ) : (
            <X size={11} strokeWidth={2.5} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-label font-medium text-foreground/90">{task.label}</span>
          <span className="block truncate text-caption text-muted-foreground">
            {task.result ? task.result.text : "Working…"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {link && task.running ? (
            <SmallButton onClick={() => void openUrl(link)}>
              Open link <ExternalLink size={10} className="opacity-60" />
            </SmallButton>
          ) : null}
          {task.running && task.cancel ? (
            <SmallButton onClick={task.cancel}>
              <Square size={9} /> Stop
            </SmallButton>
          ) : null}
          {!task.running && task.lines.length > 0 ? (
            <SmallButton onClick={() => setShowOutput((v) => !v)}>{showOutput ? "Hide output" : "Show output"}</SmallButton>
          ) : null}
          {!task.running ? (
            <button
              type="button"
              title="Close"
              onClick={onDismiss}
              className="kontinue-hover flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          ) : null}
        </span>
      </div>
      {showOutput && task.lines.length > 0 ? (
        <pre
          ref={ref}
          className="mx-2 mb-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-[14px] border border-black/[0.05] bg-zinc-950/[0.035] px-3 py-2.5 font-mono text-caption leading-relaxed text-foreground/70 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/[0.05] dark:bg-black/40 dark:text-zinc-300/80 dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]"
        >
          {task.lines.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}

function DraftField({
  label,
  description,
  value,
  placeholder,
  onCommit,
  mono,
}: {
  label: string;
  description: string;
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="space-y-1.5 px-4 py-3">
      <p className="text-label font-medium text-foreground/90">{label}</p>
      <p className="text-caption text-muted-foreground">{description}</p>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() !== value) onCommit(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          "kontinue-3d h-8 w-full rounded-full px-3.5 text-label text-foreground outline-none placeholder:text-muted-foreground/50",
          mono && "font-mono text-label",
        )}
      />
    </div>
  );
}

function ConfigField({
  instance,
  field,
  label,
  description,
  placeholder,
}: {
  instance: ProviderInstance;
  field: keyof CliConfigSetting;
  label: string;
  description: string;
  placeholder: string;
}) {
  return (
    <DraftField
      label={label}
      description={description}
      value={instance.config[field]}
      placeholder={placeholder}
      mono
      onCommit={(next) => {
        // Read the latest settings so edits to other fields are not lost.
        const latest = getProvider(instance.id) ?? instance;
        updateProvider(instance.id, { config: { ...latest.config, [field]: next } });
        // These change what is detected.
        if (field !== "launchArgs") void refreshCliProviders();
      }}
    />
  );
}

function IntervalStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const set = (next: number) => onChange(Math.max(0, Math.min(86_400, Math.round(next))));
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="kontinue-3d flex h-8 items-center rounded-full">
        <button
          type="button"
          aria-label="Decrease"
          onClick={() => set(value - 60)}
          className="flex size-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Minus size={12} />
        </button>
        <input
          value={draft}
          inputMode="numeric"
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={() => set(Number(draft) || 0)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-14 bg-transparent text-center font-mono text-label outline-none"
        />
        <button
          type="button"
          aria-label="Increase"
          onClick={() => set(value + 60)}
          className="flex size-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Plus size={12} />
        </button>
      </div>
      <span className="text-caption text-muted-foreground">seconds</span>
    </div>
  );
}

type DotTone = "ok" | "warn" | "off" | "bad";

function Dot({ tone }: { tone: DotTone }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        tone === "ok" && "bg-emerald-500",
        tone === "warn" && "bg-amber-500",
        tone === "bad" && "bg-rose-500",
        tone === "off" && "bg-foreground/25",
      )}
    />
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h4 className="px-1 text-label font-medium text-muted-foreground">{children}</h4>;
}

function SmallButton({
  children,
  onClick,
  disabled,
  title,
  tone = "neutral",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: "neutral" | "primary" | "danger";
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 cursor-pointer items-center gap-1 rounded-full px-3 text-label font-medium transition-colors disabled:cursor-default disabled:opacity-40",
        tone === "primary" && "kontinue-3d-primary",
        tone === "neutral" && "kontinue-3d text-foreground/85 hover:text-foreground",
        tone === "danger" && "kontinue-3d text-rose-500 hover:text-rose-400",
      )}
    >
      {children}
    </button>
  );
}
