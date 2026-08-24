"use client";

import React, { useState } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Search,
  X,
  Sliders,
  User,
  KeyRound,
  Zap,
  Monitor,
  Code2,
  Sparkles,
  Cpu,
  ExternalLink,
  LogOut,
  Moon,
  Sun,
  Laptop,
  Plug2,
  Check,
  Bot,
  Telescope,
  Megaphone,
  CalendarCheck,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ByokSection } from "./ByokSection";
import { KODE_MODELS } from "@repo/ai/lib/kode";
import { useByokProviders, canUseByokModel } from "@/lib/kode-byok";
import { cn } from "@/lib/utils";
import { AGENTS, type AgentDefinition } from "@repo/ai/lib/agents";
import { useKodeWorkspace } from "@/lib/kode-workspace";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";

export type SettingsTab =
  | "general"
  | "account"
  | "byok"
  | "capabilities"
  | "connectors"
  | "agents"
  | "desktop-general"
  | "developer"
  | "skills"
  | "memory";

interface NavItem {
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Settings",
    items: [
      { id: "general", label: "General", icon: Sliders },
      { id: "account", label: "Account", icon: User },
      { id: "byok", label: "API Keys (BYOK)", icon: KeyRound },
      { id: "capabilities", label: "Capabilities", icon: Zap },
    ],
  },
  {
    title: "Desktop app",
    items: [
      { id: "desktop-general", label: "General", icon: Monitor },
      { id: "developer", label: "Developer", icon: Code2 },
    ],
  },
  {
    title: "Customize",
    items: [
      { id: "agents", label: "Agents", icon: Bot },
      { id: "connectors", label: "Connectors", icon: Plug2 },
      { id: "skills", label: "Skills", icon: Sparkles },
      { id: "memory", label: "Memory", icon: Cpu },
    ],
  },
];

const UPGRADE_URL = "https://chat.kontinueai.com/pricing";

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = "general",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");

  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "Signed in";
  const fullName = user?.fullName || user?.firstName || "Developer";
  const initials = (user?.firstName?.[0] ?? "D") + (user?.lastName?.[0] ?? "A");

  const byokProviders = useByokProviders();

  // Local state for user profile instructions & preferences
  const [preferredName, setPreferredName] = useState("");
  const [workDescription, setWorkDescription] = useState("Software Engineer");
  const [customInstructions, setCustomInstructions] = useState("");
  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">("dark");
  const [fontChoice, setFontChoice] = useState("inter");

  // Filter navigation items by search query
  const filteredGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="!w-[900px] !max-w-[900px] sm:!max-w-[900px] h-[600px] max-h-[85vh] gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-popover p-0 text-foreground shadow-2xl">
        <div className="flex h-full w-full overflow-hidden">
          {/* Left Sidebar Navigation */}
          <aside className="w-60 shrink-0 border-r border-white/[0.08] bg-black/20 p-3.5 flex flex-col gap-4">
            {/* Search Input */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40"
              />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-1.5 pl-8 pr-3 text-xs outline-none placeholder:text-foreground/35 focus:border-brand/60 focus:bg-white/[0.06]"
              />
            </div>

            {/* Nav List */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {filteredGroups.map((group) => (
                <div key={group.title} className="space-y-1">
                  <h4 className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-foreground/40">
                    {group.title}
                  </h4>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTab(item.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors duration-150 text-left",
                            isActive
                              ? "bg-white/[0.08] text-foreground shadow-xs"
                              : "text-foreground/60 hover:bg-white/[0.04] hover:text-foreground"
                          )}
                        >
                          <Icon
                            size={16}
                            className={cn(
                              isActive ? "text-foreground" : "text-foreground/50"
                            )}
                          />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* Right Main Content Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-transparent">
            {/* Top Bar Header with Close Button */}
            <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4 shrink-0">
              <h2 className="text-base font-semibold capitalize text-foreground">
                {NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label ?? "Settings"}
              </h2>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                aria-label="Close settings"
              >
                <X size={16} />
              </Button>
            </div>

            {/* Tab Content Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* General Tab */}
              {activeTab === "general" && (
                <div className="space-y-6">
                  {/* Profile Section */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Profile</h3>
                    <div className="flex items-center gap-4">
                      <div className="grid size-12 place-items-center rounded-full bg-white/[0.1] text-sm font-semibold text-foreground">
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{fullName}</p>
                        <p className="text-xs text-foreground/50">{email}</p>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground/70">
                          Full name
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={fullName}
                          className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-foreground/80 outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground/70">
                          What should Kode call you?
                        </label>
                        <input
                          type="text"
                          value={preferredName}
                          onChange={(e) => setPreferredName(e.target.value)}
                          placeholder="e.g. Alex"
                          className="w-full rounded-xl border border-white/[0.1] bg-black/20 px-3 py-2 text-sm text-foreground outline-none focus:border-brand/60"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground/70">
                          What best describes your work?
                        </label>
                        <Select value={workDescription} onValueChange={setWorkDescription}>
                          <SelectTrigger className="w-full justify-between rounded-xl border border-white/[0.1] bg-black/40 px-3 py-2 text-sm text-foreground">
                            <SelectValue placeholder="Select description" />
                          </SelectTrigger>
                          <SelectContent className="border border-white/[0.08] bg-[oklch(0.18_0.004_260)] text-foreground shadow-2xl">
                            <SelectItem value="Software Engineer">Software Engineer</SelectItem>
                            <SelectItem value="Frontend Developer">Frontend Developer</SelectItem>
                            <SelectItem value="Fullstack Engineer">Fullstack Engineer</SelectItem>
                            <SelectItem value="Product Designer">Product Designer</SelectItem>
                            <SelectItem value="Founder / Executive">Founder / Executive</SelectItem>
                            <SelectItem value="Student / Researcher">Student / Researcher</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground/70">
                          Instructions for Kode
                        </label>
                        <p className="text-[11px] text-foreground/45">
                          Kode will keep these in mind across all chats and project edits.
                        </p>
                        <textarea
                          rows={3}
                          value={customInstructions}
                          onChange={(e) => setCustomInstructions(e.target.value)}
                          placeholder="e.g. Prefer TypeScript, strict types, concise modular code, and Tailwind CSS."
                          className="w-full rounded-xl border border-white/[0.1] bg-black/20 p-3 text-sm text-foreground outline-none resize-none focus:border-brand/60"
                        />
                      </div>
                    </div>
                  </section>

                  <hr className="border-white/[0.08]" />

                  {/* Preferences Section */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Preferences</h3>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-foreground/80">Appearance</p>
                        <p className="text-[11px] text-foreground/45">Choose your interface theme</p>
                      </div>
                      <div className="flex rounded-xl border border-white/[0.08] bg-black/20 p-1 gap-1">
                        <Button
                          variant={themeMode === "system" ? "secondary" : "ghost"}
                          size="xs"
                          onClick={() => setThemeMode("system")}
                        >
                          <Laptop size={13} /> System
                        </Button>
                        <Button
                          variant={themeMode === "light" ? "secondary" : "ghost"}
                          size="xs"
                          onClick={() => setThemeMode("light")}
                        >
                          <Sun size={13} /> Light
                        </Button>
                        <Button
                          variant={themeMode === "dark" ? "secondary" : "ghost"}
                          size="xs"
                          onClick={() => setThemeMode("dark")}
                        >
                          <Moon size={13} /> Dark
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-foreground/80">Chat Font</p>
                        <p className="text-[11px] text-foreground/45">Typography style for message text</p>
                      </div>
                      <Select value={fontChoice} onValueChange={setFontChoice}>
                        <SelectTrigger className="w-48 justify-between rounded-xl border border-white/[0.1] bg-black/40 px-3 py-1.5 text-xs text-foreground">
                          <SelectValue placeholder="Select font" />
                        </SelectTrigger>
                        <SelectContent className="border border-white/[0.08] bg-[oklch(0.18_0.004_260)] text-foreground shadow-2xl">
                          <SelectItem value="inter">Inter (Sans-Serif)</SelectItem>
                          <SelectItem value="mono">JetBrains Mono</SelectItem>
                          <SelectItem value="serif">System Serif</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </section>
                </div>
              )}

              {/* Account Tab */}
              {activeTab === "account" && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="grid size-14 place-items-center rounded-full bg-brand/20 text-base font-semibold text-brand">
                        {initials}
                      </div>
                      <div>
                        <h4 className="text-base font-semibold text-foreground">{fullName}</h4>
                        <p className="text-xs text-foreground/55">{email}</p>
                        <span className="mt-1.5 inline-block rounded-md bg-white/[0.08] px-2 py-0.5 text-[11px] font-medium text-foreground/75">
                          Personal Account
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Subscription Plan</h4>
                        <p className="text-xs text-foreground/50">Manage your billing and tier access</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void openUrl(UPGRADE_URL)}
                      >
                        <span>Upgrade Plan</span>
                        <ExternalLink size={13} />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="w-full justify-between py-3 h-auto"
                      onClick={() => openUserProfile()}
                    >
                      <div className="flex items-center gap-2.5">
                        <User size={16} />
                        <span>Manage Clerk Account Profile</span>
                      </div>
                      <ExternalLink size={14} className="text-foreground/40" />
                    </Button>

                    <Button
                      variant="destructive"
                      className="w-full justify-start py-3 h-auto"
                      onClick={() => void signOut()}
                    >
                      <LogOut size={16} />
                      <span>Log out of Kontinue AI</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* API Keys (BYOK) Tab */}
              {activeTab === "byok" && <ByokSection />}

              {/* Capabilities Tab */}
              {activeTab === "capabilities" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Available Models & Capabilities</h3>
                    <p className="text-xs text-foreground/50">
                      Overview of supported AI models, context windows, and key access requirements.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {KODE_MODELS.map((model) => {
                      const isUnlocked = canUseByokModel(model.id, byokProviders);
                      return (
                        <div
                          key={model.id}
                          className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-xs text-foreground">{model.name}</span>
                              <span className="text-[10px] text-foreground/45 uppercase tracking-wider">{model.provider}</span>
                            </div>
                            <p className="text-[11px] text-foreground/50">{model.description}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            {isUnlocked && (
                              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                                BYOK Connected
                              </span>
                            )}
                            <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-foreground/60 uppercase">
                              {model.minimumPlan || "Free"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Connectors Tab */}
              {activeTab === "connectors" && <ConnectorsSection />}

              {/* Agents Tab */}
              {activeTab === "agents" && <AgentsSection onOpenChange={onOpenChange} />}

              {/* Desktop App General Tab */}
              {activeTab === "desktop-general" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Desktop Environment</h3>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground/60">Application</span>
                      <span className="font-medium text-foreground">Kontinue AI</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground/60">Version</span>
                      <span className="font-medium text-foreground">v0.1.0</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground/60">Platform</span>
                      <span className="font-medium text-foreground">Tauri 2.0 (macOS Desktop)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Developer Tab */}
              {activeTab === "developer" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Developer Tools</h3>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 space-y-3">
                    <p className="text-xs text-foreground/60">
                      Access local app data directories and developer debugging utilities.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => alert("Local app data directory: ~/Library/Application Support/com.kontinueai.kode-ide")}
                    >
                      Show App Storage Path
                    </Button>
                  </div>
                </div>
              )}

              {/* Skills Tab */}
              {activeTab === "skills" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Agent Skills</h3>
                  <p className="text-xs text-foreground/50">
                    Agent skills are automatically discovered from repository configs (`.agents/skills`) and applied during execution.
                  </p>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 text-xs text-foreground/70">
                    <p>Active project skills: <strong className="text-brand">Convex, Vercel AI, React Best Practices, Monorepo Management</strong></p>
                  </div>
                </div>
              )}

              {/* Memory Tab */}
              {activeTab === "memory" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Memory & Context</h3>
                  <p className="text-xs text-foreground/50">
                    Kode keeps contextual memory across project conversations to maintain architectural coherence.
                  </p>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 text-xs text-foreground/70">
                    <p>Memory state: <span className="text-emerald-400 font-medium">Active & Synchronized</span></p>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const CONNECTORS_CATALOG = [
  { provider: "github", name: "GitHub", description: "Read your repositories and issues in chat." },
  { provider: "gmail", name: "Gmail", description: "Search and summarize your email." },
  { provider: "google_calendar", name: "Google Calendar", description: "Create events and check your schedule." },
  { provider: "google_drive", name: "Google Drive", description: "Read and reference files from your Drive." },
  { provider: "google_sheets", name: "Google Sheets", description: "Read, create and update spreadsheets from chat." },
  { provider: "notion", name: "Notion", description: "Search and read your Notion pages." },
  { provider: "vercel", name: "Vercel", description: "Check deployments and project status." },
  { provider: "todoist", name: "Todoist", description: "Sync tasks with Todoist." },
];

function getConnectorLogoUrl(provider: string): string {
  switch (provider) {
    case "github":
      return "/connectors/GitHub_dark.svg";
    case "vercel":
      return "/connectors/Vercel_dark.svg";
    case "gmail":
      return "/connectors/gmail.svg";
    case "google_calendar":
      return "/connectors/google-calendar.svg";
    case "google_drive":
      return "/connectors/google-drive.svg";
    case "google_sheets":
      return "/connectors/google-sheets.svg";
    case "notion":
      return "/connectors/notion.svg";
    case "todoist":
      return "/connectors/todoist.svg";
    default:
      return "/connectors/gmail.svg";
  }
}

function ConnectorsSection() {
  const connectors = useQuery(api.connectors.listConnectors, {});
  const connectedProviders = new Set((connectors ?? []).filter((c) => c.connected).map((c) => c.provider));

  const handleConnect = async (provider: string) => {
    try {
      await openUrl(`https://chat.kontinueai.com/api/connectors/${provider}/start`);
    } catch {
      window.open(`https://chat.kontinueai.com/api/connectors/${provider}/start`, "_blank");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Plug2 size={16} className="text-brand" />
          <h3 className="text-sm font-semibold text-foreground">Connectors</h3>
        </div>
        <p className="text-xs text-foreground/50 mt-1">
          Connect external services so Kontinue AI can read data and act on your behalf.
        </p>
      </div>

      <div className="space-y-2.5">
        {CONNECTORS_CATALOG.map((conn) => {
          const isConnected = connectedProviders.has(conn.provider);
          return (
            <div
              key={conn.provider}
              className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5"
            >
              <div className="flex items-center gap-3 min-w-0 pr-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08] p-1.5">
                  <img
                    src={getConnectorLogoUrl(conn.provider)}
                    alt={conn.name}
                    className="size-5 object-contain"
                  />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <span className="font-medium text-xs text-foreground block">{conn.name}</span>
                  <p className="text-[11px] text-foreground/50 truncate">{conn.description}</p>
                </div>
              </div>

              {isConnected ? (
                <span className="inline-flex items-center gap-1 shrink-0 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                  <Check size={13} />
                  Connected
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConnect(conn.provider)}
                  className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] px-3 py-1 text-[11.5px] font-medium text-foreground transition-colors"
                >
                  <span>Connect</span>
                  <ExternalLink size={12} className="opacity-60" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const AGENT_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Telescope,
  Code2,
  Megaphone,
  CalendarCheck,
  Bot,
};

function AgentsSection({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { createChatRecord, setActiveTab, selectChat } = useKodeWorkspace();

  const handleStartChat = async (agent: AgentDefinition, prompt?: string) => {
    try {
      onOpenChange(false);
      const chatId = await createChatRecord({
        title: prompt?.trim().slice(0, 60) || agent.name,
      });
      setActiveTab("home");
      selectChat(chatId);
    } catch (err) {
      console.error("[AgentsSection] Failed to start chat:", err);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-brand" />
          <h3 className="text-sm font-semibold text-foreground">Specialized Agents</h3>
        </div>
        <p className="text-xs text-foreground/50 mt-1">
          Specialized AI agents that share your memory, projects, and tasks. Pick one to start a focused conversation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {AGENTS.map((agent) => {
          const Icon = AGENT_ICONS[agent.icon] ?? Bot;
          return (
            <div
              key={agent.id}
              className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 transition-all hover:border-white/20 hover:bg-white/[0.04]"
            >
              <div>
                <div className="flex items-start gap-3">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border"
                    style={{
                      backgroundColor: `${agent.color}15`,
                      borderColor: `${agent.color}30`,
                      color: agent.color,
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 pr-1">
                    <span className="font-semibold text-xs text-foreground block leading-tight">{agent.name}</span>
                    <p className="text-[11px] text-foreground/50 mt-0.5 leading-normal">{agent.description}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {agent.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="rounded-full bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 text-[10.5px] font-medium text-foreground/60"
                    >
                      {cap}
                    </span>
                  ))}
                </div>

                <div className="mt-3 space-y-1">
                  {agent.suggestedActions.slice(0, 2).map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => void handleStartChat(agent, action)}
                      className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5 text-left text-[11.5px] text-foreground/70 transition-all hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
                    >
                      <span className="truncate">{action}</span>
                      <ArrowRight size={11} className="shrink-0 text-white/40" />
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleStartChat(agent)}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-semibold transition-all active:scale-[0.99]"
                style={{
                  backgroundColor: `${agent.color}20`,
                  border: `1px solid ${agent.color}40`,
                  color: agent.color,
                }}
              >
                <Icon size={13} />
                <span>Chat with {agent.name}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
