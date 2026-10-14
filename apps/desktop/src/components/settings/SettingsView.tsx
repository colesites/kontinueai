"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useClerk } from "@clerk/clerk-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTheme } from "@/components/theme/theme-provider";
import {
  Search,
  ArrowLeft,
  Settings2,
  SlidersHorizontal,
  Globe,
  Keyboard,
  Scan,
  Cpu,
  Plug2,
  CalendarClock,
  CalendarCheck,
  GitBranch,
  HardDrive,
  Link2,
  Archive,
  RotateCcw,
  Sparkles,
  Lock,
  ChevronDown,
  Check,
  ExternalLink,
  Laptop,
  Moon,
  Sun,
  Bot,
  Code2,
  Trash2,
  RefreshCw,
  Telescope,
  Megaphone,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ByokSection } from "./ByokSection";
import { useKodeWorkspace, type SettingsNavTab } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { AGENTS, type AgentDefinition } from "@repo/ai/lib/agents";

export interface SettingsViewProps {
  onBack: () => void;
  initialTab?: SettingsNavTab | string;
}

interface NavItemDef {
  id: SettingsNavTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItemDef[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "appearance", label: "Appearance", icon: Globe },
  { id: "keybindings", label: "Keybindings", icon: Keyboard },
  { id: "snapshots", label: "SnapShots", icon: Scan },
  { id: "providers", label: "Providers", icon: Cpu },
  { id: "integrations", label: "Integrations", icon: Plug2 },
  { id: "scheduled-tasks", label: "Scheduled Tasks", icon: CalendarClock },
  { id: "source-control", label: "Source Control", icon: GitBranch },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "connections", label: "Connections", icon: Link2 },
  { id: "archive", label: "Archive", icon: Archive },
];

const CONNECTORS_CATALOG = [
  { provider: "github", name: "GitHub", description: "Read repositories, pull requests and issues." },
  { provider: "gmail", name: "Gmail", description: "Search, compose and reference email messages." },
  { provider: "google_calendar", name: "Google Calendar", description: "Create events and check your schedule." },
  { provider: "google_drive", name: "Google Drive", description: "Read and reference files from your Google Drive." },
  { provider: "google_sheets", name: "Google Sheets", description: "Read, create and update spreadsheets." },
  { provider: "notion", name: "Notion", description: "Search and read workspace pages and databases." },
  { provider: "vercel", name: "Vercel", description: "Monitor deployments, logs and project status." },
  { provider: "todoist", name: "Todoist", description: "Sync tasks and action items directly with Todoist." },
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

export function SettingsView({ onBack, initialTab = "general" }: SettingsViewProps) {
  // Normalize initial tab
  const getNormalizedTab = (tab: string): SettingsNavTab => {
    if (tab === "byok") return "providers";
    if (tab === "connectors" || tab === "agents") return "integrations";
    if (NAV_ITEMS.some((i) => i.id === tab)) return tab as SettingsNavTab;
    return "general";
  };

  const [activeTab, setActiveTab] = useState<SettingsNavTab>(() => getNormalizedTab(initialTab));
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { signOut } = useClerk();

  // Synchronize when initialTab prop changes
  useEffect(() => {
    setActiveTab(getNormalizedTab(initialTab));
  }, [initialTab]);

  // General Settings state
  const [selectedModel, setSelectedModel] = useState("Claude Opus 4.6");
  const [thinkingLevel, setThinkingLevel] = useState("High · 1M");
  const [permissions, setPermissions] = useState("Full access");
  const [workspaceMode, setWorkspaceMode] = useState("Current checkout");
  const [submodulesMode, setSubmodulesMode] = useState("Recursive");

  // Organization settings state
  const [projectGrouping, setProjectGrouping] = useState(true);
  const [projectOrder, setProjectOrder] = useState("Last user message");
  const [autoResume, setAutoResume] = useState(false);
  const [snoozeLimited, setSnoozeLimited] = useState(false);
  const [workingSection, setWorkingSection] = useState(false);
  const [autoSettleMerged, setAutoSettleMerged] = useState(true);
  const [autoSettleInactive, setAutoSettleInactive] = useState(true);
  const [daysBeforeSettle, setDaysBeforeSettle] = useState(3);

  // Behavior settings state
  const [sendOnEnter, setSendOnEnter] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [telemetry, setTelemetry] = useState(true);

  // Appearance settings state
  const { theme, setTheme } = useTheme();
  const [chatFont, setChatFont] = useState("Inter");
  const [uiScaling, setUiScaling] = useState("100%");
  const [lineNumbers, setLineNumbers] = useState(true);

  // Context filters
  const [selectedProject, setSelectedProject] = useState("All projects");
  const [selectedEnvironment, setSelectedEnvironment] = useState("All environments");

  // Handle keyboard shortcuts (Escape to go back, "/" to focus search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      } else if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  const filteredNavItems = useMemo(() => {
    if (!searchQuery.trim()) return NAV_ITEMS;
    return NAV_ITEMS.filter((item) =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const activeItemDef = NAV_ITEMS.find((item) => item.id === activeTab) ?? NAV_ITEMS[0];

  const handleRestoreDefaults = () => {
    setSelectedModel("Claude Opus 4.6");
    setThinkingLevel("High · 1M");
    setPermissions("Full access");
    setWorkspaceMode("Current checkout");
    setSubmodulesMode("Recursive");
    setProjectGrouping(true);
    setProjectOrder("Last user message");
    setAutoResume(false);
    setSnoozeLimited(false);
    setWorkingSection(false);
    setAutoSettleMerged(true);
    setAutoSettleInactive(true);
    setDaysBeforeSettle(3);
    setSendOnEnter(true);
    setSoundEffects(true);
    setTelemetry(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-screen bg-[#090a0d] text-zinc-100 antialiased overflow-hidden select-none font-sans">
      {/* LEFT SIDEBAR */}
      <aside className="relative flex w-60 shrink-0 flex-col justify-between border-r border-zinc-800/70 bg-[#090a0d]">
        {/* Subtle Cosmic Nebula Glow behind the logo */}
        <div className="pointer-events-none absolute left-0 top-0 h-44 w-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/25 via-indigo-950/15 to-transparent opacity-80" />

        {/* Top Area */}
        <div className="relative z-10 flex flex-col">
          {/* Window Drag Title Bar Header */}
          <div
            data-tauri-drag-region
            className="flex h-12 items-center gap-2.5 px-4 pt-1"
          >
            {/* App Icon */}
            <div className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-purple-500/30 to-indigo-600/40 border border-purple-500/40 shadow-xs">
              <span className="text-[10px] font-bold text-purple-200">K</span>
            </div>
            <span className="text-xs font-semibold tracking-tight text-zinc-100">
              Kontinue Code
            </span>
          </div>

          {/* Quick Search Input */}
          <div className="px-3 pt-1 pb-2">
            <div className="relative flex items-center rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1.5 transition-colors focus-within:border-purple-500/60 focus-within:bg-zinc-900">
              <Search size={13} className="text-zinc-500 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="w-full bg-transparent px-2 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none"
              />
              <span className="flex size-4 items-center justify-center rounded border border-zinc-700/60 bg-zinc-800/80 text-[10px] font-medium text-zinc-400">
                /
              </span>
            </div>
          </div>

          {/* Navigation List Items */}
          <nav className="space-y-0.5 px-2 py-1">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-all duration-100 cursor-pointer",
                    isActive
                      ? "bg-zinc-800/90 text-white shadow-xs border border-zinc-700/50"
                      : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 border border-transparent"
                  )}
                >
                  <Icon
                    size={14}
                    className={cn(
                      "shrink-0",
                      isActive ? "text-white" : "text-zinc-400"
                    )}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Area */}
        <div className="relative z-10 px-3 pb-3 pt-2 space-y-1">
          {/* Logout */}
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-left cursor-pointer"
          >
            <LogOut size={13} className="shrink-0" />
            <span>Log out</span>
          </button>

          {/* Bottom Back Button & Settings Icon Row */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className="flex size-6 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors cursor-pointer"
              title="Settings"
            >
              <Settings2 size={13} />
            </button>
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN CONTENT AREA */}
      <main className="flex flex-1 flex-col overflow-y-auto bg-[#08090b]">
        {/* Top Header Bar - No line/border at all */}
        <header
          data-tauri-drag-region
          className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between bg-[#08090b] px-8"
        >
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500 font-normal">Settings</span>
            <span className="text-zinc-600">/</span>
            <span className="font-semibold text-zinc-200">{activeItemDef.label}</span>
          </div>

          {/* Right Action: Restore device defaults */}
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="flex items-center gap-1.5 text-[11.5px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Restore device defaults</span>
          </button>
        </header>

        {/* Scrollable Settings Body - Horizontally centered */}
        <div className="flex-1 max-w-[700px] w-full mx-auto px-4 pt-3 pb-24">
          {/* Subtitle with Context Dropdowns */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-6">
            <span>Applying settings for</span>

            {/* Project Context Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 text-zinc-200 underline decoration-zinc-700 underline-offset-4 hover:text-white transition-colors cursor-pointer"
                >
                  <span>{selectedProject}</span>
                  <ChevronDown size={11} className="text-zinc-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-44 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shadow-xl">
                <DropdownMenuItem onSelect={() => setSelectedProject("All projects")}>
                  All projects
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSelectedProject("Current project")}>
                  Current project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <span>across</span>

            {/* Environment Context Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 text-zinc-200 underline decoration-zinc-700 underline-offset-4 hover:text-white transition-colors cursor-pointer"
                >
                  <span>{selectedEnvironment}</span>
                  <ChevronDown size={11} className="text-zinc-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-44 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shadow-xl">
                <DropdownMenuItem onSelect={() => setSelectedEnvironment("All environments")}>
                  All environments
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSelectedEnvironment("Local development")}>
                  Local development
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSelectedEnvironment("Production")}>
                  Production
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* TAB 1: GENERAL (Pixel-perfect replica of the screenshot) */}
          {activeTab === "general" && (
            <div className="space-y-7">
              {/* SECTION: New threads */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-300">New threads</h3>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
                  {/* Row: Model */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-200">Model</span>
                        <Settings2 size={11} className="text-zinc-500" />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Default model for new threads. Projects can override it.
                      </p>
                      <span className="text-[10px] text-zinc-600 block pt-0.5">Automatic</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Model Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 rounded-lg border border-zinc-800/90 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 hover:bg-zinc-850 transition-colors cursor-pointer"
                          >
                            <Sparkles size={12} className="text-amber-500" />
                            <span>{selectedModel}</span>
                            <ChevronDown size={11} className="text-zinc-400" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-52 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shadow-xl">
                          <DropdownMenuItem onSelect={() => setSelectedModel("Claude Opus 4.6")}>
                            Claude Opus 4.6
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setSelectedModel("Claude 3.7 Sonnet")}>
                            Claude 3.7 Sonnet
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setSelectedModel("Claude 3.5 Sonnet")}>
                            Claude 3.5 Sonnet
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setSelectedModel("GPT-4o")}>
                            GPT-4o
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setSelectedModel("o3-mini")}>
                            o3-mini
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Thinking Level Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 rounded-lg border border-zinc-800/90 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 hover:bg-zinc-850 transition-colors cursor-pointer"
                          >
                            <Cpu size={12} className="text-zinc-400" />
                            <span>{thinkingLevel}</span>
                            <ChevronDown size={11} className="text-zinc-400" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-44 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shadow-xl">
                          <DropdownMenuItem onSelect={() => setThinkingLevel("High · 1M")}>
                            High · 1M
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setThinkingLevel("Medium · 500k")}>
                            Medium · 500k
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setThinkingLevel("Low · 128k")}>
                            Low · 128k
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setThinkingLevel("Disabled")}>
                            Disabled
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Row: Permissions */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-200">Permissions</span>
                        <Settings2 size={11} className="text-zinc-500" />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Default permissions for new threads. Projects can override them.
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded-lg border border-zinc-800/90 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 hover:bg-zinc-850 transition-colors cursor-pointer"
                        >
                          <Lock size={12} className="text-zinc-400" />
                          <span>{permissions}</span>
                          <ChevronDown size={11} className="text-zinc-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-44 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shadow-xl">
                        <DropdownMenuItem onSelect={() => setPermissions("Full access")}>
                          Full access
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setPermissions("Ask before write")}>
                          Ask before write
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setPermissions("Read only")}>
                          Read only
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Row: Workspace */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-200">Workspace</span>
                        <Settings2 size={11} className="text-zinc-500" />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Where new threads start. Projects and their t3.json can override it.
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded-lg border border-zinc-800/90 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 hover:bg-zinc-850 transition-colors cursor-pointer"
                        >
                          <span>{workspaceMode}</span>
                          <ChevronDown size={11} className="text-zinc-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-48 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shadow-xl">
                        <DropdownMenuItem onSelect={() => setWorkspaceMode("Current checkout")}>
                          Current checkout
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setWorkspaceMode("Workspace root")}>
                          Workspace root
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setWorkspaceMode("Scratchpad")}>
                          Scratchpad
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Row: Submodules */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-200">Submodules</span>
                        <Settings2 size={11} className="text-zinc-500" />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        How new worktrees populate git submodules. Projects and their t3.json can override it.
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded-lg border border-zinc-800/90 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 hover:bg-zinc-850 transition-colors cursor-pointer"
                        >
                          <span>{submodulesMode}</span>
                          <ChevronDown size={11} className="text-zinc-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-44 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shadow-xl">
                        <DropdownMenuItem onSelect={() => setSubmodulesMode("Recursive")}>
                          Recursive
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setSubmodulesMode("Shallow")}>
                          Shallow
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setSubmodulesMode("None")}>
                          None
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </section>

              {/* SECTION: Organization */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-300">Organization</h3>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
                  {/* Row: Project grouping */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Project grouping</span>
                      <p className="text-[11px] text-zinc-500">
                        Combine matching repositories across environments.
                      </p>
                    </div>
                    <Switch
                      checked={projectGrouping}
                      onCheckedChange={setProjectGrouping}
                    />
                  </div>

                  {/* Row: Project order */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Project order</span>
                      <p className="text-[11px] text-zinc-500">
                        Order of projects in the sidebar project picker and command palette.
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded-lg border border-zinc-800/90 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 hover:bg-zinc-850 transition-colors cursor-pointer"
                        >
                          <span>{projectOrder}</span>
                          <ChevronDown size={11} className="text-zinc-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-48 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shadow-xl">
                        <DropdownMenuItem onSelect={() => setProjectOrder("Last user message")}>
                          Last user message
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setProjectOrder("Alphabetical")}>
                          Alphabetical
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setProjectOrder("Recently created")}>
                          Recently created
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Row: Auto-resume limited threads */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-200">Auto-resume limited threads</span>
                        <Settings2 size={11} className="text-zinc-500" />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Resume usage-limit stops at the reported reset time. Each thread can cancel its scheduled continuation.
                      </p>
                    </div>
                    <Switch
                      checked={autoResume}
                      onCheckedChange={setAutoResume}
                    />
                  </div>

                  {/* Row: Snooze limited threads */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-200">Snooze limited threads</span>
                        <Settings2 size={11} className="text-zinc-500" />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Snooze usage-limit stops until the reported reset time. Combine with auto-resume to continue when they wake.
                      </p>
                    </div>
                    <Switch
                      checked={snoozeLimited}
                      onCheckedChange={setSnoozeLimited}
                    />
                  </div>

                  {/* Row: Working section (beta) */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Working section (beta)</span>
                      <p className="text-[11px] text-zinc-500">
                        Fold working and monitoring threads into a Working section. They return to the top of the inbox when they need you.
                      </p>
                    </div>
                    <Switch
                      checked={workingSection}
                      onCheckedChange={setWorkingSection}
                    />
                  </div>

                  {/* Row: Auto-settle merged threads */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-200">Auto-settle merged threads</span>
                        <Settings2 size={11} className="text-zinc-500" />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Settle a thread when its pull request merges. Closed pull requests still settle automatically.
                      </p>
                    </div>
                    <Switch
                      checked={autoSettleMerged}
                      onCheckedChange={setAutoSettleMerged}
                    />
                  </div>

                  {/* Row: Auto-settle inactive threads */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-200">Auto-settle inactive threads</span>
                        <Settings2 size={11} className="text-zinc-500" />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Sidebar threads with no activity for this long settle automatically.
                      </p>
                    </div>
                    <Switch
                      checked={autoSettleInactive}
                      onCheckedChange={setAutoSettleInactive}
                    />
                  </div>

                  {/* Row: Days of inactivity before auto-settle */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-200">Days of inactivity before auto-settle</span>
                        <Settings2 size={11} className="text-zinc-500" />
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Any new activity un-settles a thread automatically.
                      </p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={daysBeforeSettle}
                      onChange={(e) => setDaysBeforeSettle(Number(e.target.value) || 1)}
                      className="w-16 rounded-lg border border-zinc-800 bg-zinc-900/90 py-1 px-2.5 text-center text-xs font-medium text-zinc-200 outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </section>

              {/* SECTION: Behavior */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-300">Behavior</h3>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Send message on Enter</span>
                      <p className="text-[11px] text-zinc-500">
                        Press Enter to send, Shift+Enter for a new line.
                      </p>
                    </div>
                    <Switch
                      checked={sendOnEnter}
                      onCheckedChange={setSendOnEnter}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Sound effects</span>
                      <p className="text-[11px] text-zinc-500">
                        Play subtle audio cues when agents finish tasks or hit checkpoints.
                      </p>
                    </div>
                    <Switch
                      checked={soundEffects}
                      onCheckedChange={setSoundEffects}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Diagnostics & Error Reporting</span>
                      <p className="text-[11px] text-zinc-500">
                        Anonymous crash diagnostics to help improve agent reliability and latency.
                      </p>
                    </div>
                    <Switch
                      checked={telemetry}
                      onCheckedChange={setTelemetry}
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: APPEARANCE */}
          {activeTab === "appearance" && (
            <div className="space-y-7">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-300">Theme & Typography</h3>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
                  {/* Theme Switcher */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Interface Theme</span>
                      <p className="text-[11px] text-zinc-500">Select application visual tone</p>
                    </div>

                    <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/80 p-0.5 gap-1">
                      <button
                        type="button"
                        onClick={() => setTheme("dark")}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                          theme === "dark"
                            ? "bg-zinc-800 text-white font-medium"
                            : "text-zinc-400 hover:text-zinc-200"
                        )}
                      >
                        <Moon size={12} /> Dark
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme("light")}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                          theme === "light"
                            ? "bg-zinc-800 text-white font-medium"
                            : "text-zinc-400 hover:text-zinc-200"
                        )}
                      >
                        <Sun size={12} /> Light
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme("system")}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                          theme === "system"
                            ? "bg-zinc-800 text-white font-medium"
                            : "text-zinc-400 hover:text-zinc-200"
                        )}
                      >
                        <Laptop size={12} /> System
                      </button>
                    </div>
                  </div>

                  {/* Chat Font */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Editor & Chat Font</span>
                      <p className="text-[11px] text-zinc-500">Typography style for message text and code editor</p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded-lg border border-zinc-800/90 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 hover:bg-zinc-850 transition-colors"
                        >
                          <span>{chatFont}</span>
                          <ChevronDown size={11} className="text-zinc-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-48 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shadow-xl">
                        <DropdownMenuItem onSelect={() => setChatFont("Inter")}>
                          Inter (Sans-Serif)
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setChatFont("JetBrains Mono")}>
                          JetBrains Mono
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setChatFont("Fira Code")}>
                          Fira Code
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setChatFont("System Serif")}>
                          System Serif
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* UI Scaling */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">UI Zoom & Scaling</span>
                      <p className="text-[11px] text-zinc-500">Interface magnification level</p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 rounded-lg border border-zinc-800/90 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 hover:bg-zinc-850 transition-colors"
                        >
                          <span>{uiScaling}</span>
                          <ChevronDown size={11} className="text-zinc-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-36 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shadow-xl">
                        <DropdownMenuItem onSelect={() => setUiScaling("90%")}>90%</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setUiScaling("100%")}>100% (Default)</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setUiScaling("110%")}>110%</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setUiScaling("120%")}>120%</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Code Line Numbers */}
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Show Line Numbers</span>
                      <p className="text-[11px] text-zinc-500">Display line numbers in code diffs and scratchpad</p>
                    </div>
                    <Switch
                      checked={lineNumbers}
                      onCheckedChange={setLineNumbers}
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: KEYBINDINGS */}
          {activeTab === "keybindings" && (
            <div className="space-y-7">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-300">Global Keyboard Shortcuts</h3>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
                  {[
                    { action: "New Conversation", shortcut: "⌘ N", category: "Navigation" },
                    { action: "Quick Search", shortcut: "⌘ K or /", category: "Navigation" },
                    { action: "Open Settings", shortcut: "⌘ ,", category: "System" },
                    { action: "Toggle Left Sidebar", shortcut: "⌘ B", category: "View" },
                    { action: "Toggle Thinking Mode", shortcut: "⌘ T", category: "Composer" },
                    { action: "Send Message", shortcut: "Return", category: "Composer" },
                    { action: "Insert New Line", shortcut: "Shift + Return", category: "Composer" },
                    { action: "Switch to Canvas View", shortcut: "⌘ 1", category: "Mode" },
                    { action: "Switch to Kode View", shortcut: "⌘ 2", category: "Mode" },
                    { action: "Close / Dismiss Modal", shortcut: "Esc", category: "System" },
                  ].map((kb) => (
                    <div key={kb.action} className="flex items-center justify-between p-4">
                      <div className="space-y-0.5">
                        <span className="text-xs font-medium text-zinc-200">{kb.action}</span>
                        <p className="text-[11px] text-zinc-500">{kb.category}</p>
                      </div>
                      <kbd className="rounded border border-zinc-700/70 bg-zinc-800/90 px-2 py-0.5 text-xs font-mono font-medium text-zinc-300 shadow-xs">
                        {kb.shortcut}
                      </kbd>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: SNAPSHOTS */}
          {activeTab === "snapshots" && (
            <div className="space-y-7">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-300">Workspace Snapshots & Checkpoints</h3>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Auto-Snapshot on Agent Writes</span>
                      <p className="text-[11px] text-zinc-500">
                        Create an automatic rollback checkpoint before an agent applies multi-file code modifications.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Maximum Snapshots per Thread</span>
                      <p className="text-[11px] text-zinc-500">
                        Number of historic rollback checkpoints kept in local storage.
                      </p>
                    </div>
                    <span className="text-xs font-medium text-zinc-300">25 checkpoints</span>
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Snapshot Diff Format</span>
                      <p className="text-[11px] text-zinc-500">Unified git diff representation</p>
                    </div>
                    <span className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                      Unified Diff
                    </span>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 5: PROVIDERS (Embeds BYOK) */}
          {activeTab === "providers" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-semibold text-zinc-300">API Keys & Model Providers (BYOK)</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Bring your own API keys for Anthropic, OpenAI, Agent Router, and custom endpoints.
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
                <ByokSection />
              </div>
            </div>
          )}

          {/* TAB 6: INTEGRATIONS (Embeds Connectors & Specialized Agents) */}
          {(activeTab === "integrations" || activeTab === "agents") && (
            <IntegrationsSection
              defaultSubTab={activeTab === "agents" ? "agents" : "connectors"}
              onCloseSettings={onBack}
            />
          )}

          {/* TAB 7: SCHEDULED TASKS */}
          {activeTab === "scheduled-tasks" && (
            <div className="space-y-7">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-300">Background Tasks & Automation</h3>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Background Automation Cron</span>
                      <p className="text-[11px] text-zinc-500">
                        Allow scheduled agent runs while Kontinue AI is running in the background.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Task Failure Notifications</span>
                      <p className="text-[11px] text-zinc-500">
                        Surface system notification banners if an automated task encounters an error.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 8: SOURCE CONTROL */}
          {activeTab === "source-control" && (
            <div className="space-y-7">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-300">Git & Version Control</h3>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Automatic Staging</span>
                      <p className="text-[11px] text-zinc-500">
                        Stage modified files automatically before running git commit tools.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Conventional Commits</span>
                      <p className="text-[11px] text-zinc-500">
                        Enforce conventional commit syntax (feat:, fix:, chore:, refactor:) on generated messages.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Default Target Branch</span>
                      <p className="text-[11px] text-zinc-500">Base branch for worktrees and PRs</p>
                    </div>
                    <span className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                      main
                    </span>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 9: STORAGE */}
          {activeTab === "storage" && (
            <div className="space-y-7">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-300">Local Cache & App Storage</h3>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Indexed Documentation Cache</span>
                      <p className="text-[11px] text-zinc-500">Local vectors and embeddings for offline search grounding</p>
                    </div>
                    <span className="text-xs font-medium text-zinc-400">~14.2 MB</span>
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Clear Cache</span>
                      <p className="text-[11px] text-zinc-500">
                        Purge cached tokens, temporary image downloads, and regenerated artifacts.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => alert("Local cache cleared successfully.")}
                      className="border-zinc-800 bg-zinc-900 text-xs text-zinc-300 hover:text-white"
                    >
                      <Trash2 size={12} className="mr-1.5" />
                      Clear Cache
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 10: CONNECTIONS */}
          {activeTab === "connections" && (
            <div className="space-y-7">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-300">Remote Connections & Bridges</h3>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Convex Real-time Sync</span>
                      <p className="text-[11px] text-zinc-500">Durable cloud synchronization for threads and workspaces</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                      Connected
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-zinc-200">Local Bridge Server</span>
                      <p className="text-[11px] text-zinc-500">Loopback port for Tauri IPC and native system commands</p>
                    </div>
                    <span className="text-xs font-mono text-zinc-400">127.0.0.1:4483</span>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 11: ARCHIVE */}
          {activeTab === "archive" && <ArchiveSection />}
        </div>
      </main>
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

function IntegrationsSection({
  defaultSubTab = "connectors",
  onCloseSettings,
}: {
  defaultSubTab?: "connectors" | "agents";
  onCloseSettings?: () => void;
}) {
  const [subTab, setSubTab] = useState<"connectors" | "agents">(defaultSubTab);
  const connectors = useQuery(api.connectors.listConnectors, {});
  const connectedProviders = new Set((connectors ?? []).filter((c) => c.connected).map((c) => c.provider));
  const { createChatRecord, setActiveTab, selectChat } = useKodeWorkspace();

  const handleConnect = async (provider: string) => {
    try {
      await openUrl(`https://chat.kontinueai.com/api/connectors/${provider}/start`);
    } catch {
      window.open(`https://chat.kontinueai.com/api/connectors/${provider}/start`, "_blank");
    }
  };

  const handleStartAgentChat = async (agent: AgentDefinition, prompt?: string) => {
    try {
      onCloseSettings?.();
      const chatId = await createChatRecord({
        title: prompt?.trim().slice(0, 60) || agent.name,
      });
      setActiveTab("home");
      selectChat(chatId);
    } catch (err) {
      console.error("[SettingsView] Failed to start agent chat:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Subtab Switcher */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          type="button"
          onClick={() => setSubTab("connectors")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
            subTab === "connectors"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          Connectors ({CONNECTORS_CATALOG.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab("agents")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
            subTab === "agents"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          Specialized Agents ({AGENTS.length})
        </button>
      </div>

      {subTab === "connectors" ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-zinc-300">Connectors & External Services</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Connect third-party accounts so Kontinue AI agents can read and write data on your behalf.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
            {CONNECTORS_CATALOG.map((conn) => {
              const isConnected = connectedProviders.has(conn.provider);
              return (
                <div
                  key={conn.provider}
                  className="flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800/70 border border-zinc-700/60 p-1.5">
                      <img
                        src={getConnectorLogoUrl(conn.provider)}
                        alt={conn.name}
                        className="size-5 object-contain"
                      />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-medium text-xs text-zinc-200 block">{conn.name}</span>
                      <p className="text-[11px] text-zinc-500 truncate">{conn.description}</p>
                    </div>
                  </div>

                  {isConnected ? (
                    <span className="inline-flex items-center gap-1 shrink-0 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                      <Check size={12} />
                      Connected
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleConnect(conn.provider)}
                      className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-zinc-800 hover:bg-zinc-750 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:text-white transition-colors cursor-pointer border border-zinc-700/60"
                    >
                      <span>Connect</span>
                      <ExternalLink size={11} className="opacity-60" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <div>
            <h3 className="text-xs font-semibold text-zinc-300">Specialized Domain Agents</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Targeted AI agents with tailored prompts, toolkits, and memory focus.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {AGENTS.map((agent) => {
              const Icon = AGENT_ICONS[agent.icon] ?? Bot;
              return (
                <div
                  key={agent.id}
                  className="flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 transition-all hover:border-zinc-700"
                >
                  <div>
                    <div className="flex items-start gap-3">
                      <div
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg border"
                        style={{
                          backgroundColor: `${agent.color}15`,
                          borderColor: `${agent.color}35`,
                          color: agent.color,
                        }}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0 pr-1">
                        <span className="font-semibold text-xs text-zinc-200 block leading-tight">
                          {agent.name}
                        </span>
                        <p className="text-[11px] text-zinc-500 mt-1 leading-normal">
                          {agent.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {agent.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="rounded-md bg-zinc-800/80 border border-zinc-700/50 px-2 py-0.5 text-[10px] font-medium text-zinc-400"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleStartAgentChat(agent)}
                    className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer"
                    style={{
                      backgroundColor: `${agent.color}20`,
                      border: `1px solid ${agent.color}40`,
                      color: agent.color,
                    }}
                  >
                    <Icon size={12} />
                    <span>Chat with {agent.name}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function ArchiveSection() {
  const { chats, archiveChat, deleteChat } = useKodeWorkspace();
  const archivedChats = useMemo(() => chats.filter((c) => c.archived), [chats]);

  return (
    <div className="space-y-7">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-300">Archived Conversations</h3>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Archived threads are hidden from the sidebar but preserved for your reference.
        </p>

        {archivedChats.length === 0 ? (
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/20 p-8 text-center text-xs text-zinc-500">
            No archived threads found.
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60 overflow-hidden">
            {archivedChats.map((chat) => (
              <div key={chat.id} className="flex items-center justify-between p-4">
                <div className="min-w-0 pr-4">
                  <span className="text-xs font-medium text-zinc-200 block truncate">
                    {chat.title}
                  </span>
                  <span className="text-[10.5px] text-zinc-500">
                    Archived on {new Date(chat.updatedAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void archiveChat(chat.id, false)}
                    className="border-zinc-800 bg-zinc-900 text-xs text-zinc-300 hover:text-white"
                  >
                    <RefreshCw size={11} className="mr-1" />
                    Restore
                  </Button>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void deleteChat(chat.id)}
                    className="text-xs"
                  >
                    <Trash2 size={11} className="mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
