import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { PanelLeft, Search, Home, Code2, Plus, Palette, ListTodo, Bot, Plug2 } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { SearchModal } from "@/components/search/SearchModal";
import { useIsFullscreen } from "@/hooks/use-is-fullscreen";
import { tasksApi } from "@/lib/convex-api";
import { bucketFor } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { SidebarNavItem } from "./SidebarNavItem";
import { AlphaBadge } from "@/components/ui/alpha-badge";

const iconButton =
  "flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground";

/** Home | Kode. Canvas and Tasks belong to Home, so Home stays lit there. */
function ModeSwitch({ kode, onChange }: { kode: boolean; onChange: (kode: boolean) => void }) {
  const option = (active: boolean) =>
    cn(
      "flex h-7 items-center justify-center gap-1.5 rounded-full border text-label transition-colors",
      active
        ? "kontinue-capsule font-semibold text-purple-900 dark:text-purple-100"
        : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-muted-foreground dark:hover:text-foreground",
    );
  return (
    <div role="tablist" aria-label="Workspace" className="kontinue-3d grid grid-cols-2 rounded-full p-0.5">
      <button type="button" role="tab" aria-selected={!kode} onClick={() => onChange(false)} className={option(!kode)}>
        <Home size={13} strokeWidth={1.5} />
        Home
      </button>
      <button type="button" role="tab" aria-selected={kode} onClick={() => onChange(true)} className={option(kode)}>
        <Code2 size={13} strokeWidth={1.5} />
        Kode
      </button>
    </div>
  );
}

/** Open tasks that are overdue or due today. */
function TaskCount() {
  const tasks = useQuery(tasksApi.tasks.listTasks, {});
  const { overdue, today } = useMemo(() => {
    let overdue = 0;
    let today = 0;
    for (const task of tasks ?? []) {
      const bucket = bucketFor(task);
      if (bucket === "overdue") overdue += 1;
      else if (bucket === "today") today += 1;
    }
    return { overdue, today };
  }, [tasks]);

  const count = overdue + today;
  if (count === 0) return null;
  const label = overdue > 0 ? `${overdue} overdue${today ? `, ${today} due today` : ""}` : `${today} due today`;
  return (
    <span
      title={label}
      aria-label={label}
      className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-micro font-semibold tabular-nums"
      style={
        overdue > 0
          ? { color: "var(--status-danger)", backgroundColor: "color-mix(in srgb, var(--status-danger) 14%, transparent)" }
          : { color: "var(--muted-foreground)", backgroundColor: "color-mix(in srgb, var(--muted-foreground) 16%, transparent)" }
      }
    >
      {count}
    </span>
  );
}

export default function LeftSidebarHeader() {
  const { toggleSidebar } = useSidebar();
  const { activeTab, setActiveTab, newChat, activeChatId, openSettings } = useKodeWorkspace();
  const [searchOpen, setSearchOpen] = useState(false);
  const isFullscreen = useIsFullscreen();

  const inKode = activeTab === "kode";
  const isNewActive = (activeTab === "home" || inKode) && activeChatId === null;

  return (
    <div className="select-none space-y-2 px-2 pt-1 pb-1">
      {/* Sidebar toggle and search, in the window's drag region. Same x
          positions as FloatingSidebarButtonGroup (left-[92px] + p-1 capsule,
          size-6 icons, gap-1) so they don't jump when the sidebar toggles. */}
      <div
        data-tauri-drag-region
        className={cn("flex items-center gap-1 pt-1.5 pb-1", isFullscreen ? "pr-1 pl-2.5" : "pr-1 pl-[88px]")}
      >
        <button type="button" onClick={toggleSidebar} title="Hide sidebar (⌘B)" aria-label="Hide sidebar" className={iconButton}>
          <PanelLeft size={15} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          title={inKode ? "Search threads" : "Search chats"}
          aria-label={inKode ? "Search threads" : "Search chats"}
          className={iconButton}
        >
          <Search size={15} strokeWidth={1.5} />
        </button>
        <AlphaBadge className="ml-auto mr-1" />
      </div>

      <ModeSwitch kode={inKode} onChange={(kode) => setActiveTab(kode ? "kode" : "home")} />

      <nav aria-label="Main" className="space-y-0.5 pt-0.5">
        <SidebarNavItem icon={Plus} label={inKode ? "New thread" : "New chat"} active={isNewActive} onClick={() => newChat()} />

        {inKode ? null : (
          <>
            <SidebarNavItem icon={Palette} label="Canvas" active={activeTab === "canvas"} onClick={() => setActiveTab("canvas")} />
            <SidebarNavItem
              icon={ListTodo}
              label="Tasks"
              active={activeTab === "tasks"}
              onClick={() => setActiveTab("tasks")}
              trailing={<TaskCount />}
            />
            {/* Agents are for the Kontinue chat only; Customize shows everywhere. */}
            <SidebarNavItem icon={Bot} label="Agents" onClick={() => openSettings("agents")} />
          </>
        )}

        <SidebarNavItem icon={Plug2} label="Customize" onClick={() => openSettings("customize")} />
      </nav>

      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
