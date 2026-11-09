import { WebhooksSection } from "./WebhooksSection";
import { Webhook } from "lucide-react";
import { eventToKeys, findConflicts, formatKeys, KEYBINDING_COMMANDS, pauseKeybindings, resetBindings, setBinding, useBindings } from "@/lib/kode-keybindings";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import {
  Archive,
  ArrowLeft,
  Bot,
  CalendarCheck,
  Check,
  ChevronDown,
  Code2,
  ExternalLink,
  Gauge,
  Keyboard,
  Laptop,
  LogOut,
  Megaphone,
  Moon,
  Palette,
  Plug2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sun,
  Telescope,
  Terminal,
  Trash2,
  UserRound,
} from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProvidersSection } from "./ProvidersSection";
import { CustomizeSection, type CustomizeTab } from "./CustomizeSection";
import { UsageSection } from "./UsageSection";
import { useKodeWorkspace, type SettingsNavTab } from "@/lib/kode-workspace";
import {
  resetSettings,
  updateSettings,
  useAppSettings,
  type TextSize,
} from "@/lib/app-settings";
import { KODE_AGENT_MODES } from "@/lib/kode-tools";
import { KODE_DEFAULT_MODEL_ID, KODE_MODELS } from "@repo/ai/lib/kode";
import { AGENTS, type AgentDefinition } from "@repo/ai/lib/agents";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { cn } from "@/lib/utils";

const WEB_APP = "https://chat.kontinueai.com";

export interface SettingsViewProps {
  onBack: () => void;
  initialTab?: SettingsNavTab | string;
}

type NavItem = {
  id: SettingsNavTab;
  label: string;
  description: string;
  icon: typeof SlidersHorizontal;
};

const NAV: NavItem[] = [
  { id: "general", label: "General", description: "How chats and Kode sessions behave.", icon: SlidersHorizontal },
  { id: "appearance", label: "Appearance", description: "Theme, text size and motion.", icon: Palette },
  { id: "usage", label: "Usage", description: "Plan limits, activity and usage credits.", icon: Gauge },
  { id: "providers", label: "Providers", description: "How Kode reaches each model: your Claude or ChatGPT subscription, your own API key, or Kode.", icon: Terminal },
  { id: "customize", label: "Customize", description: "Connectors, skills and plugins for Kontinue and Kode.", icon: Plug2 },
  { id: "agents", label: "Agents", description: "Specialized agents for the Kontinue chat.", icon: Bot },
  { id: "shortcuts", label: "Keyboard shortcuts", description: "Every shortcut in the app.", icon: Keyboard },
  { id: "webhooks", label: "Webhooks", description: "URLs that start a Kode thread when GitHub, GitLab, CI or any service sends an event.", icon: Webhook },
  { id: "account", label: "Account", description: "Your profile, plan and sign-in.", icon: UserRound },
  { id: "data", label: "Data", description: "Archived chats and data stored on this device.", icon: Archive },
];

// Older ids used by openSettings() callers.
const ALIASES: Record<string, SettingsNavTab> = {
  byok: "providers",
  models: "providers",
  integrations: "customize",
  connectors: "customize",
  skills: "customize",
  mcp: "customize",
  plugins: "customize",
  keybindings: "shortcuts",
  archive: "data",
};

function normalizeTab(tab: string | undefined): SettingsNavTab {
  if (!tab) return "general";
  if (ALIASES[tab]) return ALIASES[tab];
  return NAV.some((item) => item.id === tab) ? (tab as SettingsNavTab) : "general";
}

/** Which Customize tab an old or direct id opens. */
function customizeTabFor(tab: string | undefined): CustomizeTab {
  if (tab === "skills") return "skills";
  if (tab === "plugins") return "plugins";
  return "connectors";
}

export function SettingsView({ onBack, initialTab }: SettingsViewProps) {
  const [active, setActive] = useState<SettingsNavTab>(() => normalizeTab(initialTab));
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => setActive(normalizeTab(initialTab)), [initialTab]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA");
      if (event.key === "Escape") {
        // Let open menus close first.
        if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
        event.preventDefault();
        onBack();
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const visibleNav = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return NAV;
    return NAV.filter((item) =>
      `${item.label} ${item.description}`.toLowerCase().includes(needle),
    );
  }, [query]);

  const current = NAV.find((item) => item.id === active) ?? NAV[0];

  return (
    <div className="liquid-backdrop fixed inset-0 z-50 flex text-foreground antialiased dark:bg-background">
      {/* Left nav: same material as the main sidebar */}
      <aside className="liquid-glass-sidebar flex w-60 shrink-0 flex-col">
        <div data-tauri-drag-region className="h-11 shrink-0" />
        <div className="px-2.5">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-full px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]"
          >
            <ArrowLeft size={13} />
            Back to app
          </button>
          <div className="kontinue-3d mt-2 flex h-8 items-center gap-2 rounded-full px-3">
            <Search size={12} className="shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings"
              className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60"
            />
            <kbd className="text-[10px] text-muted-foreground/60">/</kbd>
          </div>
        </div>

        <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-2.5">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const selected = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item.id)}
                className={cn(
                  "flex h-[30px] w-full cursor-pointer items-center gap-2 rounded-full border px-2.5 text-[12px] transition-colors",
                  selected
                    ? "kontinue-capsule font-semibold text-purple-900 dark:text-purple-100"
                    : "border-transparent text-zinc-600 hover:bg-black/[0.04] hover:text-foreground dark:text-muted-foreground dark:hover:bg-white/[0.05]",
                )}
              >
                <Icon
                  size={13}
                  strokeWidth={1.6}
                  className={selected ? "text-purple-600 dark:text-purple-300" : undefined}
                />
                {item.label}
              </button>
            );
          })}
          {visibleNav.length === 0 ? (
            <p className="px-3 py-2 text-[11.5px] text-muted-foreground">No matching settings.</p>
          ) : null}
        </nav>
        <AppVersion />
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div data-tauri-drag-region className="sticky top-0 z-10 h-11" />
        <div
          className={cn(
            "mx-auto w-full px-8 pb-16",
            active === "providers" || active === "customize" ? "max-w-4xl" : "max-w-2xl",
          )}
        >
          <header className="mb-6">
            <h1 className="text-[20px] font-semibold tracking-tight">{current.label}</h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{current.description}</p>
          </header>
          {active === "general" && <GeneralSection />}
          {active === "appearance" && <AppearanceSection />}
          {active === "usage" && <UsageSection onOpenModels={() => setActive("providers")} />}
          {active === "providers" && <ProvidersSection />}
          {active === "customize" && (
            <CustomizeSection key={String(initialTab)} initialTab={customizeTabFor(initialTab)} />
          )}
          {active === "agents" && <AgentsSection onClose={onBack} />}
          {active === "shortcuts" && <ShortcutsSection />}
          {active === "webhooks" && <WebhooksSection />}
          {active === "account" && <AccountSection />}
          {active === "data" && <DataSection />}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title ? (
        <h2 className="mb-2 px-1 text-[11.5px] font-medium text-muted-foreground">{title}</h2>
      ) : null}
      <div className="liquid-glass-dropdown divide-y divide-black/[0.05] !rounded-[20px] dark:divide-white/[0.05]">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-foreground/90">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="kontinue-3d flex items-center gap-0.5 rounded-full p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11.5px] transition-colors",
            value === option.value
              ? "kontinue-capsule font-semibold text-purple-900 dark:text-purple-100"
              : "border border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; description?: string }[];
  onChange: (value: string) => void;
}) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="kontinue-3d flex h-8 min-w-[150px] cursor-pointer items-center justify-between gap-2 rounded-full px-3.5 text-[12px] text-foreground/90"
        >
          <span className="truncate">{selected?.label}</span>
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {options.map((option) => (
          <DropdownMenuItem key={option.value} onClick={() => onChange(option.value)}>
            <div className="min-w-0 flex-1">
              <p className="truncate">{option.label}</p>
              {option.description ? (
                <p className="truncate text-[10.5px] text-muted-foreground">{option.description}</p>
              ) : null}
            </div>
            {option.value === value ? <Check size={13} className="shrink-0 text-purple-500" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PillButton({
  children,
  onClick,
  tone = "neutral",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "neutral" | "primary" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium transition-colors disabled:cursor-default disabled:opacity-50",
        tone === "primary" && "kontinue-3d-primary",
        tone === "neutral" && "kontinue-3d text-foreground/85 hover:text-foreground",
        tone === "danger" && "kontinue-3d text-rose-500 hover:text-rose-400",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function GeneralSection() {
  const settings = useAppSettings();
  const modes = KODE_AGENT_MODES.filter(
    (mode) => mode.id !== "ask" && mode.id !== "design",
  );

  return (
    <>
      <Card title="Chat">
        <Row
          label="Send messages with"
          description={
            settings.sendOnEnter
              ? "Enter sends. Shift+Enter adds a new line."
              : "⌘ Enter sends. Enter adds a new line."
          }
        >
          <Segmented
            value={settings.sendOnEnter ? "enter" : "mod"}
            options={[
              { value: "enter", label: "Enter" },
              { value: "mod", label: "⌘ Enter" },
            ]}
            onChange={(value) => updateSettings({ sendOnEnter: value === "enter" })}
          />
        </Row>
        <Row
          label="Message navigator"
          description="The slim rail on the right of a chat that jumps between your messages."
        >
          <Switch
            checked={settings.showTurnNavigator}
            onCheckedChange={(checked) => updateSettings({ showTurnNavigator: checked })}
          />
        </Row>
      </Card>

      <Card title="Kode defaults">
        <Row label="Default model" description="New Kode sessions start with this model.">
          <Select
            value={settings.defaultKodeModel ?? KODE_DEFAULT_MODEL_ID}
            options={KODE_MODELS.map((model) => ({
              value: model.id,
              label: model.name,
              description: model.description,
            }))}
            onChange={(value) => updateSettings({ defaultKodeModel: value })}
          />
        </Row>
        <Row label="Default mode" description="How much the agent may do without asking.">
          <Select
            value={settings.defaultKodeMode}
            options={modes.map((mode) => ({
              value: mode.id,
              label: mode.label,
              description: mode.description,
            }))}
            onChange={(value) =>
              updateSettings({ defaultKodeMode: value as typeof settings.defaultKodeMode })
            }
          />
        </Row>
      </Card>

      <div className="flex justify-end">
        <PillButton onClick={resetSettings}>
          <RefreshCw size={12} />
          Restore defaults
        </PillButton>
      </div>
    </>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const settings = useAppSettings();

  return (
    <Card>
      <Row label="Theme" description="System follows your Mac's appearance.">
        <Segmented
          value={theme}
          options={[
            { value: "system", label: "System", icon: <Laptop size={12} /> },
            { value: "light", label: "Light", icon: <Sun size={12} /> },
            { value: "dark", label: "Dark", icon: <Moon size={12} /> },
          ]}
          onChange={setTheme}
        />
      </Row>
      <Row label="Text size" description="Scales all text and controls in the app.">
        <Segmented<TextSize>
          value={settings.textSize}
          options={[
            { value: "small", label: "Small" },
            { value: "default", label: "Default" },
            { value: "large", label: "Large" },
          ]}
          onChange={(value) => updateSettings({ textSize: value })}
        />
      </Row>
      <Row label="Reduce motion" description="Turn off animations and transitions.">
        <Switch
          checked={settings.reduceMotion}
          onCheckedChange={(checked) => updateSettings({ reduceMotion: checked })}
        />
      </Row>
    </Card>
  );
}

function openExternal(url: string) {
  void openUrl(url).catch(() => window.open(url, "_blank"));
}

const AGENT_ICONS: Record<string, typeof Bot> = { Telescope, Code2, Megaphone, CalendarCheck, Bot };

function AgentsSection({ onClose }: { onClose: () => void }) {
  const { createChatRecord, setActiveTab, selectChat } = useKodeWorkspace();
  const [starting, setStarting] = useState<string | null>(null);

  const start = async (agent: AgentDefinition) => {
    setStarting(agent.id);
    try {
      const chatId = await createChatRecord({ title: agent.name });
      onClose();
      setActiveTab("home");
      selectChat(chatId);
    } catch (err) {
      console.error("[Settings] Could not start agent chat:", err);
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {AGENTS.map((agent) => {
        const Icon = AGENT_ICONS[agent.icon] ?? Bot;
        return (
          <div key={agent.id} className="liquid-glass-dropdown flex flex-col !rounded-[20px] p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-purple-500/20 bg-purple-500/10 text-purple-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] dark:bg-purple-500/15 dark:text-purple-300">
                <Icon size={16} />
              </div>
              <p className="text-[13px] font-semibold">{agent.name}</p>
            </div>
            <p className="mt-2.5 flex-1 text-[11.5px] leading-relaxed text-muted-foreground">
              {agent.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              {agent.capabilities.slice(0, 4).map((cap) => (
                <span key={cap} className="kontinue-3d rounded-full px-2 py-0.5 text-[10px] text-foreground/70">
                  {cap}
                </span>
              ))}
            </div>
            <div className="mt-4">
              <PillButton onClick={() => void start(agent)} disabled={starting === agent.id}>
                {starting === agent.id ? "Starting…" : `Chat with ${agent.name}`}
              </PillButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Keys handled inside inputs and components; not rebindable.
const FIXED_SHORTCUTS: { group: string; items: { keys: string[]; label: string }[] }[] = [
  {
    group: "App",
    items: [
      { keys: ["⌘", "B"], label: "Toggle the sidebar" },
      { keys: ["Esc"], label: "Close settings, menus and dialogs" },
      { keys: ["/"], label: "Search settings" },
    ],
  },
  {
    group: "Chat",
    items: [
      { keys: ["Enter"], label: "Send (or new line, if ⌘ Enter sends)" },
      { keys: ["⌘", "Enter"], label: "Send, or save an edited message" },
      { keys: ["Shift", "Enter"], label: "New line" },
      { keys: ["@"], label: "Tag a file or folder" },
      { keys: ["/"], label: "Commands, skills and connectors" },
      { keys: ["⌘", "S"], label: "Stash the draft" },
    ],
  },
];

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key, index) => (
        <kbd key={`${key}-${index}`} className="kontinue-3d flex h-6 min-w-6 items-center justify-center rounded-full px-2 font-sans text-[11px] text-foreground/80">
          {key}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutsSection() {
  const bindings = useBindings();
  const [recording, setRecording] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    pauseKeybindings(true);
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(null);
        return;
      }
      const keys = eventToKeys(event);
      if (!keys) return;
      if (!keys.includes("+")) {
        setWarning("Use at least one modifier (⌘, Ctrl, ⌥ or ⇧) so typing isn't affected.");
        return;
      }
      const conflicts = findConflicts(recording, keys, bindings);
      for (const id of conflicts) setBinding(id, "");
      setWarning(conflicts.length ? `Moved from "${KEYBINDING_COMMANDS.find((c) => c.id === conflicts[0])?.label}", which is now unbound.` : null);
      setBinding(recording, keys);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      pauseKeybindings(false);
    };
  }, [recording, bindings]);

  const groups = ["App", "Kode"] as const;
  return (
    <>
      {groups.map((group) => (
        <Card key={group} title={group === "App" ? "App (rebindable)" : "Kode (rebindable)"}>
          {KEYBINDING_COMMANDS.filter((command) => command.group === group).map((command) => {
            const keys = bindings[command.id];
            return (
              <div key={command.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[12.5px] text-foreground/85">{command.label}</span>
                <span className="flex items-center gap-2">
                  {recording === command.id ? (
                    <span className="text-[11.5px] text-purple-600 dark:text-purple-300">Press keys… (Esc to cancel)</span>
                  ) : keys ? (
                    <Keys keys={formatKeys(keys)} />
                  ) : (
                    <span className="text-[11.5px] text-muted-foreground">Unbound</span>
                  )}
                  <PillButton onClick={() => setRecording(recording === command.id ? null : command.id)}>{recording === command.id ? "Cancel" : "Change"}</PillButton>
                  {keys !== command.defaultKeys ? <PillButton onClick={() => setBinding(command.id, null)}>Reset</PillButton> : null}
                </span>
              </div>
            );
          })}
        </Card>
      ))}
      {warning ? <p className="px-1 text-[11.5px] text-amber-600 dark:text-amber-400">{warning}</p> : null}
      {FIXED_SHORTCUTS.map((group) => (
        <Card key={group.group} title={group.group}>
          {group.items.map((item) => (
            <div key={item.label} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[12.5px] text-foreground/85">{item.label}</span>
              <Keys keys={item.keys} />
            </div>
          ))}
        </Card>
      ))}
      <div className="flex justify-end">
        <PillButton onClick={() => resetBindings()}>Reset all shortcuts</PillButton>
      </div>
    </>
  );
}

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  plus: "Plus",
  pro: "Pro",
  max: "Max",
};

function AccountSection() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const plan = usePlanTier();
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <>
      <Card>
        <div className="flex items-center gap-4 px-4 py-4">
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="" className="size-12 rounded-full object-cover ring-1 ring-purple-500/25" />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full bg-purple-500/15 text-sm font-semibold text-purple-300">
              {(user?.fullName ?? email ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{user?.fullName || "Your account"}</p>
            <p className="truncate text-[12px] text-muted-foreground">{email}</p>
          </div>
          <span className="kontinue-capsule px-3 py-1 text-[11.5px] font-semibold text-purple-900 dark:text-purple-100">
            {PLAN_LABEL[plan] ?? plan}
          </span>
        </div>
      </Card>

      <Card>
        <Row label="Plan and billing" description="Change plan, payment method or invoices.">
          <PillButton onClick={() => openExternal(`${WEB_APP}/pricing`)}>
            {plan === "free" ? "Upgrade" : "Manage"}
            <ExternalLink size={11} className="opacity-60" />
          </PillButton>
        </Row>
        <Row label="Profile and security" description="Name, email, password and sessions.">
          <PillButton onClick={() => openExternal(`${WEB_APP}/settings`)}>
            Open on web
            <ExternalLink size={11} className="opacity-60" />
          </PillButton>
        </Row>
        <Row label="Sign out" description="Signs out of Kontinue on this device.">
          <PillButton tone="danger" onClick={() => void signOut()}>
            <LogOut size={12} />
            Sign out
          </PillButton>
        </Row>
      </Card>
    </>
  );
}

// Local keys this app writes. Clearing them never touches account data.
const LOCAL_KEYS = [
  "kontinue:kode-import-context:v1",
  "kontinue.favorite-models",
  "kontinue.panel.width",
  "kontinue.panel.tab",
];

function DataSection() {
  const { chats, archiveChat, deleteChat } = useKodeWorkspace();
  const archived = useMemo(() => chats.filter((chat) => chat.archived), [chats]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);

  const clearLocal = () => {
    for (const key of LOCAL_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    resetSettings();
    setConfirmClear(false);
    setCleared(true);
  };

  return (
    <>
      <Card title={`Archived chats${archived.length ? ` (${archived.length})` : ""}`}>
        {archived.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            No archived chats. Archive a chat from its menu to hide it from the sidebar.
          </p>
        ) : (
          archived.map((chat) => (
            <div key={chat.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-foreground/90">{chat.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(chat.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <PillButton onClick={() => void archiveChat(chat.id, false)}>Restore</PillButton>
              <button
                type="button"
                title="Delete permanently"
                aria-label={`Delete ${chat.title}`}
                onClick={() => void deleteChat(chat.id)}
                className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-rose-500"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </Card>

      <Card title="This device">
        <Row
          label="Clear local data"
          description={
            cleared
              ? "Cleared. Preferences are back to their defaults."
              : "Resets preferences, import sync state, favorite models and panel layout on this Mac. Your chats and account are not affected."
          }
        >
          {confirmClear ? (
            <div className="flex items-center gap-1.5">
              <PillButton onClick={() => setConfirmClear(false)}>Cancel</PillButton>
              <PillButton tone="danger" onClick={clearLocal}>
                Clear
              </PillButton>
            </div>
          ) : (
            <PillButton tone="danger" onClick={() => setConfirmClear(true)}>
              Clear…
            </PillButton>
          )}
        </Row>
      </Card>
    </>
  );
}

function AppVersion() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);
  return (
    <p className="px-5 py-3 text-[10.5px] text-muted-foreground/60">
      Kontinue AI{version ? ` · v${version}` : ""}
    </p>
  );
}
