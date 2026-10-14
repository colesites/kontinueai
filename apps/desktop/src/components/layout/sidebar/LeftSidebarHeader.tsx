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
import { cn } from "@/lib/utils";

export default function LeftSidebarHeader() {
  const { toggleSidebar } = useSidebar();
  const { activeTab, setActiveTab, newChat, activeChatId, openSettings } = useKodeWorkspace();
  const [searchOpen, setSearchOpen] = useState(false);

  const isHomeActive = activeTab !== "kode";
  const isNewActive = activeTab !== "canvas" && activeChatId === null;

  return (
    <div className="px-2 pt-1 space-y-2 pb-1 select-none">
      {/* 1. Top Icons Row: PanelLeft Toggle + Search Icon with macOS window drag region */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-1.5 pt-1.5 pb-1 px-1"
      >
        <button
          type="button"
          onClick={toggleSidebar}
          title="Toggle sidebar"
          className="flex size-6 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <PanelLeft size={14} strokeWidth={1.25} />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          title="Search threads"
          className="flex size-6 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <Search size={14} strokeWidth={1.25} />
        </button>
      </div>

      {/* 2. Mode Switcher Tabs: [ Home | Kode ] */}
      <div className="grid grid-cols-2 rounded-full bg-white/40 dark:bg-secondary/60 border border-white/60 dark:border-border p-0.5 h-[28px] items-center backdrop-blur-sm shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]">
        <button
          type="button"
          onClick={() => setActiveTab("home")}
          className={`flex items-center justify-center gap-1.5 rounded-full py-0.5 px-2 text-[11.5px] transition-all h-[23px] cursor-pointer ${
            isHomeActive
              ? "bg-white/90 dark:bg-purple-600/30 text-purple-900 dark:text-purple-100 border border-purple-300/60 dark:border-purple-500/30 font-semibold shadow-[0_2px_8px_rgba(168,85,247,0.12),inset_0_1px_1px_rgba(255,255,255,1)]"
              : "bg-transparent text-zinc-500 hover:text-zinc-900 dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          <Home size={12.5} strokeWidth={1.5} className={isHomeActive ? "text-purple-600 dark:text-purple-300" : "text-zinc-500 dark:text-muted-foreground"} />
          <span>Home</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("kode")}
          className={`flex items-center justify-center gap-1.5 rounded-full py-0.5 px-2 text-[11.5px] transition-all h-[23px] cursor-pointer ${
            activeTab === "kode"
              ? "bg-white/90 dark:bg-purple-600/30 text-purple-900 dark:text-purple-100 border border-purple-300/60 dark:border-purple-500/30 font-semibold shadow-[0_2px_8px_rgba(168,85,247,0.12),inset_0_1px_1px_rgba(255,255,255,1)]"
              : "bg-transparent text-zinc-500 hover:text-zinc-900 dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          <Code2 size={12.5} strokeWidth={1.5} className={activeTab === "kode" ? "text-purple-600 dark:text-purple-300" : "text-zinc-500 dark:text-muted-foreground"} />
          <span>Kode</span>
        </button>
      </div>

      {/* 3. Action List Items */}
      <div className="space-y-0.5 pt-0.5">
        {/* + New */}
        <button
          type="button"
          onClick={() => {
            if (activeTab === "canvas") setActiveTab("home");
            newChat();
          }}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] transition-all active:scale-[0.99] h-[28px] cursor-pointer",
            isNewActive
              ? "bg-gradient-to-r from-purple-500/12 to-purple-600/8 hover:from-purple-500/20 hover:to-purple-600/15 border border-purple-300/60 dark:bg-purple-600/20 dark:border-purple-500/25 text-purple-900 dark:text-purple-100 font-semibold shadow-[0_2px_8px_rgba(168,85,247,0.08),inset_0_1px_1px_rgba(255,255,255,0.9)]"
              : "text-zinc-600 dark:text-muted-foreground hover:bg-white/50 dark:hover:bg-accent hover:text-zinc-950 dark:hover:text-foreground border border-transparent font-normal"
          )}
        >
          <Plus size={12.5} strokeWidth={1.75} className={isNewActive ? "text-purple-600 dark:text-purple-300" : "text-zinc-500 dark:text-muted-foreground"} />
          <span>New</span>
        </button>

        {/* Canvas & Tasks (Home-only) */}
        {isHomeActive && (
          <>
            {/* Canvas */}
            <button
              type="button"
              onClick={() => setActiveTab("canvas")}
              className={cn(
                "flex w-full items-center gap-2 rounded-full px-2.5 py-0.5 text-[11.5px] transition-all active:scale-[0.99] h-[28px] cursor-pointer",
                activeTab === "canvas"
                  ? "bg-gradient-to-r from-purple-500/12 to-purple-600/8 hover:from-purple-500/20 hover:to-purple-600/15 border border-purple-300/60 dark:bg-purple-600/20 dark:border-purple-500/25 text-purple-900 dark:text-purple-100 font-semibold shadow-[0_2px_8px_rgba(168,85,247,0.08),inset_0_1px_1px_rgba(255,255,255,0.9)]"
                  : "text-zinc-600 dark:text-muted-foreground hover:bg-white/50 dark:hover:bg-accent hover:text-zinc-950 dark:hover:text-foreground border border-transparent font-normal"
              )}
            >
              <Palette size={12.5} strokeWidth={1.5} className={activeTab === "canvas" ? "text-purple-600 dark:text-purple-300" : "text-zinc-500 dark:text-muted-foreground"} />
              <span>Canvas</span>
            </button>

            {/* Tasks */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-full px-2.5 py-0.5 text-[11.5px] font-normal text-zinc-600 dark:text-muted-foreground transition-all hover:bg-white/50 dark:hover:bg-accent hover:text-zinc-950 dark:hover:text-foreground border border-transparent h-[28px] cursor-pointer"
            >
              <ListTodo size={12.5} strokeWidth={1.5} className="text-zinc-500 dark:text-muted-foreground" />
              <span>Tasks</span>
            </button>
          </>
        )}

        {/* Agents & Connectors (Available in both Home and Kode) */}
        {/* Agents */}
        <button
          type="button"
          onClick={() => openSettings("agents")}
          className="flex w-full items-center gap-2 rounded-full px-2.5 py-0.5 text-[11.5px] font-normal text-zinc-600 dark:text-muted-foreground transition-all hover:bg-white/50 dark:hover:bg-accent hover:text-zinc-950 dark:hover:text-foreground border border-transparent h-[28px] cursor-pointer"
        >
          <Bot size={12.5} strokeWidth={1.5} className="text-zinc-500 dark:text-muted-foreground" />
          <span>Agents</span>
        </button>

        {/* Connectors */}
        <button
          type="button"
          onClick={() => openSettings("integrations")}
          className="flex w-full items-center gap-2 rounded-full px-2.5 py-0.5 text-[11.5px] font-normal text-zinc-600 dark:text-muted-foreground transition-all hover:bg-white/50 dark:hover:bg-accent hover:text-zinc-950 dark:hover:text-foreground border border-transparent h-[28px] cursor-pointer"
        >
          <Plug2 size={12.5} strokeWidth={1.5} className="text-zinc-500 dark:text-muted-foreground" />
          <span>Connectors</span>
        </button>
      </div>

      {/* Reusable Glassmorphic Search Modal */}
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
