import { Code2 } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import PlanView from "@/components/view/PlanView";
import { ActionPanel } from "@/components/layout/ActionPanel";
import { useSidebar } from "@/components/ui/sidebar";
import FloatingSidebarButtonGroup from "@/components/layout/sidebar/FloatingSidebarButtonGroup";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { useIsFullscreen } from "@/hooks/use-is-fullscreen";
import { cn } from "@/lib/utils";

type KodeViewProps = {
  bottomPanelOpen: boolean;
  sidePanelOpen: boolean;
  onBottomPanelChange: (open: boolean) => void;
  onSidePanelChange: (open: boolean) => void;
};

export default function KodeView({
  bottomPanelOpen,
  sidePanelOpen,
  onBottomPanelChange,
  onSidePanelChange,
}: KodeViewProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isFullscreen = useIsFullscreen();
  const { projects, chats, activeChatId, draftProjectId } = useKodeWorkspace();

  const activeProjectId =
    (activeChatId
      ? chats.find((chat) => chat.id === activeChatId)?.projectId
      : draftProjectId) ?? null;
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null;
  const activeChat =
    (activeChatId ? chats.find((chat) => chat.id === activeChatId) : null) ??
    null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Floating sidebar buttons when sidebar is collapsed */}
      {isCollapsed && <FloatingSidebarButtonGroup />}

      <header
        data-tauri-drag-region
        className={cn(
          "relative z-20 flex h-11 shrink-0 items-center justify-between gap-3 px-4",
          isCollapsed && (isFullscreen ? "pl-[132px]" : "pl-[234px]"),
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-black/[0.06] bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.03]">
            <Code2 size={11} strokeWidth={1.75} className="text-purple-600/80 dark:text-purple-300/80" />
          </span>
          <span className="shrink-0 truncate text-[12px] font-medium text-foreground/80">
            {activeProject?.name ?? "Kode"}
          </span>
          {activeChat ? (
            <>
              <span className="shrink-0 text-foreground/20">/</span>
              <span className="min-w-0 truncate text-[12px] text-foreground/45">
                {activeChat.title}
              </span>
            </>
          ) : (
            <>
              <span className="shrink-0 text-foreground/20">/</span>
              <span className="text-[12px] text-foreground/35">Workspace</span>
            </>
          )}
        </div>

        <div className="pointer-events-auto">
          <Topbar
            bottomPanelOpen={bottomPanelOpen}
            sidePanelOpen={sidePanelOpen}
            onBottomPanelChange={onBottomPanelChange}
            onSidePanelChange={onSidePanelChange}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <PlanView />
        </div>

        <ActionPanel
          layout="side"
          open={sidePanelOpen}
          onClose={() => onSidePanelChange(false)}
        />
      </div>

      {/* Bottom panel */}
      <ActionPanel
        layout="bottom"
        open={bottomPanelOpen}
        onClose={() => onBottomPanelChange(false)}
      />
    </div>
  );
}
