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

  return (
    <div className="px-2 pt-2 space-y-2 pb-1">
      {/* 1. Top Icons Row: PanelLeft Toggle + Search Icon */}
      <div className="flex items-center gap-1.5 px-0.5 pt-0.5 pb-0.5">
        <button
          type="button"
          onClick={toggleSidebar}
          title="Toggle sidebar"
          className="flex size-6 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <PanelLeft size={15} strokeWidth={1.25} />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          title="Search threads"
          className="flex size-6 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <Search size={15} strokeWidth={1.25} />
        </button>
      </div>

      {/* 2. Mode Switcher Tabs: [ Home | Kode ] */}
      <div className="grid grid-cols-2 rounded-md bg-[#1b1b1b] p-0.5 h-[28px] items-center">
        <button
          type="button"
          onClick={() => setActiveTab("home")}
          className={`flex items-center justify-center gap-1.5 rounded-sm py-0.5 px-2 text-[11.5px] transition-all h-[23px] ${
            activeTab === "home"
              ? "bg-[#343434] text-white font-medium"
              : "bg-transparent text-[#9b9b9b] hover:text-white"
          }`}
        >
          <Home size={12.5} strokeWidth={1.5} className={activeTab === "home" ? "text-white" : "text-[#9b9b9b]"} />
          <span>Home</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("kode")}
          className={`flex items-center justify-center gap-1.5 rounded-sm py-0.5 px-2 text-[11.5px] transition-all h-[23px] ${
            activeTab === "kode"
              ? "bg-[#343434] text-white font-medium"
              : "bg-transparent text-[#9b9b9b] hover:text-white"
          }`}
        >
          <Code2 size={12.5} strokeWidth={1.5} className={activeTab === "kode" ? "text-white" : "text-[#9b9b9b]"} />
          <span>Kode</span>
        </button>
      </div>

      {/* 3. Action List Items */}
      <div className="space-y-0.5 pt-0.5">
        {/* + New */}
        <button
          type="button"
          onClick={() => newChat()}
          className="flex w-full items-center gap-1.5 rounded-md bg-[#2c2c2e] px-2.5 py-0.5 text-[11.5px] font-normal text-white transition-all hover:bg-[#343438] active:scale-[0.99] h-[27px]"
        >
          <Plus size={12.5} strokeWidth={1.5} />
          <span>New</span>
        </button>

        {/* Canvas */}
        <button
          type="button"
          onClick={() => setActiveTab("canvas")}
          className={`flex w-full items-center gap-2 rounded px-2 py-0.5 text-[11.5px] font-normal transition-colors h-[24px] ${
            activeTab === "canvas"
              ? "bg-[#2c2c2e] text-white font-medium"
              : "text-[#8e8e93] hover:bg-white/[0.05] hover:text-white"
          }`}
        >
          <Palette size={12.5} strokeWidth={1.25} className="text-[#8e8e93]" />
          <span>Canvas</span>
        </button>

        {/* Tasks */}
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-[11.5px] font-normal text-[#8e8e93] transition-colors hover:bg-white/[0.05] hover:text-white h-[24px]"
        >
          <ListTodo size={12.5} strokeWidth={1.25} className="text-[#8e8e93]" />
          <span>Tasks</span>
        </button>

        {/* Agents */}
        <button
          type="button"
          onClick={() => setAgentsSettingsOpen(true)}
          className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-[11.5px] font-normal text-[#8e8e93] transition-colors hover:bg-white/[0.05] hover:text-white h-[24px]"
        >
          <Bot size={12.5} strokeWidth={1.25} className="text-[#8e8e93]" />
          <span>Agents</span>
        </button>

        {/* Connectors */}
        <button
          type="button"
          onClick={() => setConnectorsSettingsOpen(true)}
          className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-[11.5px] font-normal text-[#8e8e93] transition-colors hover:bg-white/[0.05] hover:text-white h-[24px]"
        >
          <Plug2 size={12.5} strokeWidth={1.25} className="text-[#8e8e93]" />
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
