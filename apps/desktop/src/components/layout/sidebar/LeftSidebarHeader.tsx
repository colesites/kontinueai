import { useState } from "react";
import {
  PanelLeft,
  Search,
  Home,
  Code2,
  Plus,
  Palette,
  ListTodo,
  Bot,
  Plug2,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { SearchModal } from "@/components/search/SearchModal";
import { SettingsDialog } from "@/components/settings/SettingsDialog";

export default function LeftSidebarHeader() {
  const { toggleSidebar } = useSidebar();
  const { activeTab, setActiveTab, newChat } = useKodeWorkspace();
  const [searchOpen, setSearchOpen] = useState(false);
  const [connectorsSettingsOpen, setConnectorsSettingsOpen] = useState(false);
  const [agentsSettingsOpen, setAgentsSettingsOpen] = useState(false);

  const isHomeActive = activeTab !== "kode";

  return (
    <div className="px-2 pt-1 space-y-2 pb-1 select-none">
      {/* 1. Top Icons Row: PanelLeft Toggle + Search Icon with macOS window drag region */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-1.5 pt-1.5 pb-1 pl-[72px] pr-1"
      >
        <button
          type="button"
          onClick={toggleSidebar}
          title="Toggle sidebar"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <PanelLeft size={14} strokeWidth={1.25} />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          title="Search threads"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <Search size={14} strokeWidth={1.25} />
        </button>
      </div>

      {/* 2. Mode Switcher Tabs: [ Home | Kode ] */}
      <div className="grid grid-cols-2 rounded-lg bg-secondary/60 border border-border p-0.5 h-[28px] items-center">
        <button
          type="button"
          onClick={() => setActiveTab("home")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-0.5 px-2 text-[11.5px] transition-all h-[23px] ${
            isHomeActive
              ? "bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-600/30 dark:text-purple-100 dark:border-purple-500/30 font-semibold shadow-xs"
              : "bg-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Home size={12.5} strokeWidth={1.5} className={isHomeActive ? "text-purple-600 dark:text-purple-300" : "text-muted-foreground"} />
          <span>Home</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("kode")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-0.5 px-2 text-[11.5px] transition-all h-[23px] ${
            activeTab === "kode"
              ? "bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-600/30 dark:text-purple-100 dark:border-purple-500/30 font-semibold shadow-xs"
              : "bg-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Code2 size={12.5} strokeWidth={1.5} className={activeTab === "kode" ? "text-purple-600 dark:text-purple-300" : "text-muted-foreground"} />
          <span>Kode</span>
        </button>
      </div>

      {/* 3. Action List Items */}
      <div className="space-y-0.5 pt-0.5">
        {/* + New */}
        <button
          type="button"
          onClick={() => newChat()}
          className="flex w-full items-center gap-1.5 rounded-md bg-purple-100 border border-purple-300 text-purple-700 hover:bg-purple-200 dark:bg-purple-600/20 dark:border-purple-500/25 dark:text-purple-100 dark:hover:bg-purple-600/30 px-2.5 py-0.5 text-[11.5px] font-medium transition-all active:scale-[0.99] h-[27px] shadow-xs"
        >
          <Plus size={12.5} strokeWidth={1.75} className="text-purple-600 dark:text-purple-300" />
          <span>New</span>
        </button>

        {/* Canvas */}
        <button
          type="button"
          onClick={() => setActiveTab("canvas")}
          className={`flex w-full items-center gap-2 rounded px-2 py-0.5 text-[11.5px] font-normal transition-colors h-[24px] ${
            activeTab === "canvas"
              ? "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-200 font-medium"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Palette size={12.5} strokeWidth={1.25} className={activeTab === "canvas" ? "text-purple-600 dark:text-purple-300" : "text-muted-foreground"} />
          <span>Canvas</span>
        </button>

        {/* Tasks */}
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-[11.5px] font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground h-[24px]"
        >
          <ListTodo size={12.5} strokeWidth={1.25} className="text-muted-foreground" />
          <span>Tasks</span>
        </button>

        {/* Agents */}
        <button
          type="button"
          onClick={() => setAgentsSettingsOpen(true)}
          className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-[11.5px] font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground h-[24px]"
        >
          <Bot size={12.5} strokeWidth={1.25} className="text-muted-foreground" />
          <span>Agents</span>
        </button>

        {/* Connectors */}
        <button
          type="button"
          onClick={() => setConnectorsSettingsOpen(true)}
          className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-[11.5px] font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground h-[24px]"
        >
          <Plug2 size={12.5} strokeWidth={1.25} className="text-muted-foreground" />
          <span>Connectors</span>
        </button>
      </div>

      {/* Reusable Glassmorphic Search Modal */}
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Settings Dialog opened to Connectors tab */}
      {connectorsSettingsOpen && (
        <SettingsDialog
          open={connectorsSettingsOpen}
          onOpenChange={setConnectorsSettingsOpen}
          initialTab="connectors"
        />
      )}

      {/* Settings Dialog opened to Agents tab */}
      {agentsSettingsOpen && (
        <SettingsDialog
          open={agentsSettingsOpen}
          onOpenChange={setAgentsSettingsOpen}
          initialTab="agents"
        />
      )}
    </div>
  );
}
