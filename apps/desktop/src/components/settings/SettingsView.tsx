import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { getVersion } from "@tauri-apps/api/app";
import {
  Archive,
  ArrowLeft,
  Bot,
  CalendarCheck,
  CalendarClock,
  Camera,
  Code2,
  ExternalLink,
  Gauge,
  GitBranch,
  HardDrive,
  Keyboard,
  Laptop,
  LogOut,
  Megaphone,
  Moon,
  Palette,
  Plug2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sun,
  Telescope,
  Terminal,
  Trash2,
  UserRound,
  Webhook,
} from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { Switch } from "@/components/ui/switch";
import { WebhooksSection } from "./WebhooksSection";
import { ProvidersSection } from "./ProvidersSection";
import { CustomizeSection, type CustomizeTab } from "./CustomizeSection";
import { UsageSection } from "./UsageSection";
import { GeneralSection, restoreGeneralDefaults } from "./GeneralSection";
import { ShortcutsSection } from "./ShortcutsSection";
import { SnapshotsSection } from "./SnapshotsSection";
import { ScheduledTasksSection } from "./ScheduledTasksSection";
import { SourceControlSection } from "./SourceControlSection";
import { StorageSection } from "./StorageSection";
import { Card, LinkButton, openExternal, PillButton, Row, Segmented } from "./settings-ui";
import { useKodeWorkspace, type SettingsNavTab } from "@/lib/kode-workspace";
import {
  resetSettings,
  updateSettings,
  useAppSettings,
  type InterfaceFont,
  type TextSize,
} from "@/lib/app-settings";
import { AGENTS, type AgentDefinition } from "@repo/ai/lib/agents";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { cn } from "@/lib/utils";
import { AlphaBadge } from "@/components/ui/alpha-badge";

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
  /** Extra words the settings search matches. */
  keywords?: string;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "App",
    items: [
      { id: "general", label: "General", description: "Defaults for new Kode threads, chat behaviour and confirmations.", icon: SlidersHorizontal, keywords: "model mode permissions reasoning fast send enter navigator delete version about privacy" },
      { id: "appearance", label: "Appearance", description: "Theme, font, text size and motion.", icon: Palette, keywords: "dark light theme font zoom animation" },
      { id: "shortcuts", label: "Keyboard shortcuts", description: "Every shortcut in the app. Click one to change it.", icon: Keyboard, keywords: "keybindings hotkeys keys" },
      { id: "snapshots", label: "Snapshots", description: "Capture a window and attach it to a new Kode thread.", icon: Camera, keywords: "screenshot screen capture accessibility" },
    ],
  },
  {
    label: "Kode",
    items: [
      { id: "providers", label: "Providers", description: "How Kode reaches each model: your Claude or ChatGPT subscription, your own API key, or Kode.", icon: Terminal, keywords: "claude codex cursor api key byok cli" },
      { id: "customize", label: "Customize", description: "Connectors, skills and plugins for Kontinue and Kode.", icon: Plug2, keywords: "connectors skills plugins mcp integrations" },
      { id: "agents", label: "Agents", description: "Specialized agents for the Kontinue chat.", icon: Bot },
      { id: "scheduled", label: "Scheduled tasks", description: "Prompts queued for Kode chats, and your Kontinue tasks and reminders.", icon: CalendarClock, keywords: "schedule queue later limit reset tasks reminders todo" },
      { id: "source-control", label: "Source control", description: "Git tools, pull request watching and Auto-fix.", icon: GitBranch, keywords: "git github gitlab bitbucket pull request pr merge auto-fix ci" },
      { id: "storage", label: "Storage", description: "Worktrees and disk space Kode uses on this Mac.", icon: HardDrive, keywords: "worktrees disk space cleanup delete" },
      { id: "webhooks", label: "Webhooks", description: "URLs that start a Kode thread when GitHub, GitLab, CI or any service sends an event.", icon: Webhook },
    ],
  },
  {
    label: "Account",
    items: [
      { id: "usage", label: "Usage", description: "Plan limits, activity and usage credits.", icon: Gauge, keywords: "limits credits billing" },
      { id: "account", label: "Account", description: "Your profile, plan and sign-in.", icon: UserRound, keywords: "sign out plan billing profile" },
      { id: "data", label: "Data", description: "Archived chats and data stored on this device.", icon: Archive, keywords: "archive archived clear" },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Settings pages, for the command palette. */
export const SETTINGS_PAGES = NAV.map(({ id, label, icon, keywords }) => ({ id, label, icon, keywords: keywords ?? "" }));

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
  schedule: "scheduled",
  git: "source-control",
  worktrees: "storage",
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
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => setActive(normalizeTab(initialTab)), [initialTab]);
  useEffect(() => mainRef.current?.scrollTo({ top: 0 }), [active]);

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

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return NAV_GROUPS;
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        `${item.label} ${item.description} ${item.keywords ?? ""}`.toLowerCase().includes(needle),
      ),
    })).filter((group) => group.items.length);
  }, [query]);

  const current = NAV.find((item) => item.id === active) ?? NAV[0];
  const wide = active === "providers" || active === "customize";

  let headerAction: ReactNode = null;
  if (active === "general") {
    headerAction = (
      <LinkButton onClick={restoreGeneralDefaults}>
        <RotateCcw size={12} />
        Restore defaults
      </LinkButton>
    );
  }

  return (
    <div className="liquid-backdrop fixed inset-0 z-50 flex text-foreground antialiased dark:bg-background">
      {/* Left nav: same material as the main sidebar */}
      <aside className="liquid-glass-sidebar flex w-60 shrink-0 flex-col">
        <div data-tauri-drag-region className="h-11 shrink-0" />
        <div className="px-2.5">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-full px-2.5 text-label text-muted-foreground transition-colors kontinue-hover hover:text-foreground"
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
              onKeyDown={(e) => {
                const first = visibleGroups[0]?.items[0];
                if (e.key === "Enter" && first) setActive(first.id);
              }}
              placeholder="Search settings"
              className="w-full bg-transparent text-label outline-none placeholder:text-muted-foreground/60"
            />
            <kbd className="text-micro text-muted-foreground/60">/</kbd>
          </div>
        </div>

        <nav className="mt-3 flex-1 overflow-y-auto px-2.5 pb-3">
          {visibleGroups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-2.5 pb-1 text-caption font-medium text-muted-foreground/60">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const selected = item.id === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActive(item.id)}
                      className={cn(
                        "flex h-[30px] w-full cursor-pointer items-center gap-2 rounded-full border px-2.5 text-label transition-colors",
                        selected
                          ? "kontinue-capsule font-semibold text-purple-900 dark:text-purple-100"
                          : "border-transparent text-zinc-600 kontinue-hover hover:text-foreground dark:text-muted-foreground",
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
              </div>
            </div>
          ))}
          {visibleGroups.length === 0 ? (
            <p className="px-3 py-2 text-label text-muted-foreground">No matching settings.</p>
          ) : null}
        </nav>
        <AppVersion />
      </aside>

      {/* Content */}
      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
        <div
          data-tauri-drag-region
          className="sticky top-0 z-10 flex h-11 items-center justify-between gap-3 px-6 backdrop-blur-md"
        >
          <p data-tauri-drag-region className="flex items-center gap-1.5 text-label text-muted-foreground">
            Settings <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground/90">{current.label}</span>
          </p>
          {headerAction}
        </div>
        <div className={cn("mx-auto w-full px-10 pt-4 pb-20", wide ? "max-w-[1120px]" : "max-w-[980px]")}>
          <header className="mb-7">
            <h1 className="text-[22px] font-semibold tracking-tight">{current.label}</h1>
            <p className="mt-1 text-body text-muted-foreground">{current.description}</p>
          </header>
          {active === "general" && <GeneralSection />}
          {active === "appearance" && <AppearanceSection />}
          {active === "shortcuts" && <ShortcutsSection />}
          {active === "snapshots" && <SnapshotsSection onOpenShortcuts={() => setActive("shortcuts")} />}
          {active === "usage" && <UsageSection onOpenModels={() => setActive("providers")} />}
          {active === "providers" && <ProvidersSection />}
          {active === "customize" && (
            <CustomizeSection key={String(initialTab)} initialTab={customizeTabFor(initialTab)} />
          )}
          {active === "agents" && <AgentsSection onClose={onBack} />}
          {active === "scheduled" && <ScheduledTasksSection onClose={onBack} />}
          {active === "source-control" && <SourceControlSection onClose={onBack} />}
          {active === "storage" && <StorageSection />}
          {active === "webhooks" && <WebhooksSection />}
          {active === "account" && <AccountSection />}
          {active === "data" && <DataSection />}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const THEMES = [
  { value: "system", label: "System", icon: Laptop },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

function ThemePreview({ kind }: { kind: "system" | "light" | "dark" }) {
  const pane = (dark: boolean) => (
    <div className={cn("flex h-full flex-1 gap-1 p-1.5", dark ? "bg-[#111114]" : "bg-[#f4f4f6]")}>
      <div className={cn("w-1/4 rounded-[4px]", dark ? "bg-white/[0.06]" : "bg-black/[0.06]")} />
      <div className="flex flex-1 flex-col gap-1">
        <div className={cn("h-1.5 w-2/3 rounded-full", dark ? "bg-white/20" : "bg-black/15")} />
        <div className={cn("h-1.5 w-1/2 rounded-full", dark ? "bg-white/10" : "bg-black/10")} />
        <div className="mt-auto h-2.5 rounded-full bg-purple-500/70" />
      </div>
    </div>
  );
  return (
    <div className="flex h-16 w-full overflow-hidden rounded-[10px] border border-black/[0.08] dark:border-white/[0.08]">
      {kind === "system" ? (
        <>
          {pane(false)}
          {pane(true)}
        </>
      ) : (
        pane(kind === "dark")
      )}
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const settings = useAppSettings();

  return (
    <>
      <Card title="Theme">
        <div className="grid grid-cols-3 gap-3 p-4">
          {THEMES.map((option) => {
            const selected = theme === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-[14px] border p-2 text-left transition-colors",
                  selected
                    ? "border-purple-500/60 bg-purple-500/[0.06] ring-1 ring-purple-500/30"
                    : "border-transparent kontinue-hover",
                )}
              >
                <ThemePreview kind={option.value} />
                <span className="flex items-center gap-1.5 px-0.5 text-label font-medium">
                  <Icon size={12} className={selected ? "text-purple-500" : "text-muted-foreground"} />
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="px-5 py-2.5 text-label text-muted-foreground">System follows your Mac's appearance.</p>
      </Card>

      <Card title="Text">
        <Row label="Interface font" description="System uses San Francisco. Figtree is Kontinue's rounded typeface.">
          <Segmented<InterfaceFont>
            value={settings.interfaceFont}
            options={[
              { value: "system", label: "System" },
              { value: "figtree", label: "Figtree" },
            ]}
            onChange={(value) => updateSettings({ interfaceFont: value })}
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
      </Card>

      <Card title="Motion">
        <Row label="Reduce motion" description="Turn off animations and transitions.">
          <Switch
            checked={settings.reduceMotion}
            onCheckedChange={(checked) => updateSettings({ reduceMotion: checked })}
          />
        </Row>
      </Card>
    </>
  );
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {AGENTS.map((agent) => {
        const Icon = AGENT_ICONS[agent.icon] ?? Bot;
        return (
          <div key={agent.id} className="liquid-glass-dropdown flex flex-col !rounded-[20px] p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-purple-500/20 bg-purple-500/10 text-purple-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] dark:bg-purple-500/15 dark:text-purple-300">
                <Icon size={16} />
              </div>
              <p className="text-body font-semibold">{agent.name}</p>
            </div>
            <p className="mt-2.5 flex-1 text-label leading-relaxed text-muted-foreground">
              {agent.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              {agent.capabilities.slice(0, 4).map((cap) => (
                <span key={cap} className="kontinue-3d rounded-full px-2 py-0.5 text-micro text-foreground/70">
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
            <p className="truncate text-lead font-semibold">{user?.fullName || "Your account"}</p>
            <p className="truncate text-label text-muted-foreground">{email}</p>
          </div>
          <span className="kontinue-capsule px-3 py-1 text-label font-semibold text-purple-900 dark:text-purple-100">
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
  const { archivedChats: archived, setChatArchived, deleteChat } = useKodeWorkspace();
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
          <p className="px-4 py-6 text-center text-label text-muted-foreground">
            No archived chats. Archive a chat from its menu to hide it from the sidebar.
          </p>
        ) : (
          archived.map((chat) => (
            <div key={chat.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body text-foreground/90">{chat.title}</p>
                <p className="text-caption text-muted-foreground">
                  {chat.kind === "kode" ? "Kode" : "Chat"} · {new Date(chat.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <PillButton onClick={() => void setChatArchived(chat.id, chat.kind, false)}>Restore</PillButton>
              <button
                type="button"
                title="Delete permanently"
                aria-label={`Delete ${chat.title}`}
                onClick={() => void deleteChat(chat.id, chat.kind)}
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
    <p className="flex items-center gap-1.5 px-5 py-3 text-caption text-muted-foreground/60">
      Kontinue AI{version ? ` · v${version}` : ""}
      <AlphaBadge />
    </p>
  );
}
