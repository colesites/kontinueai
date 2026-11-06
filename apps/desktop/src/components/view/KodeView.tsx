import { Topbar } from "@/components/layout/topbar";
import PlanView from "@/components/view/PlanView";
import { WorkspacePanel } from "@/components/panel/WorkspacePanel";
import { useSidebar } from "@/components/ui/sidebar";
import FloatingSidebarButtonGroup from "@/components/layout/sidebar/FloatingSidebarButtonGroup";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { useIsFullscreen } from "@/hooks/use-is-fullscreen";
import { cn } from "@/lib/utils";

type KodeViewProps = {
  panelOpen: boolean;
  onPanelChange: (open: boolean) => void;
};

export default function KodeView({ panelOpen, onPanelChange }: KodeViewProps) {
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
    <div className="flex h-full w-full overflow-hidden">
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Floating sidebar buttons when sidebar is collapsed */}
      {isCollapsed && <FloatingSidebarButtonGroup />}

      <header
        data-tauri-drag-region
        className={cn(
          "relative z-20 flex h-11 shrink-0 items-center justify-between gap-3 px-4",
          isCollapsed && (isFullscreen ? "pl-[132px]" : "pl-[214px]"),
        )}
      >
        {/* Breadcrumb only for an open chat; a new session shows nothing. */}
        <div className="flex min-w-0 items-center gap-2">
          {activeChat ? (
            <>
              {activeProject ? (
                <>
                  <span className="shrink-0 truncate text-[12px] font-medium text-foreground/80">
                    {activeProject.name}
                  </span>
                  <span className="shrink-0 text-foreground/20">/</span>
                </>
              ) : null}
              <span className="min-w-0 truncate text-[12px] text-foreground/45">
                {activeChat.title}
              </span>
            </>
          ) : null}
        </div>

        {/* The open panel has its own close button. */}
        {!panelOpen ? (
          <div className="pointer-events-auto">
            <Topbar panelOpen={panelOpen} onPanelChange={onPanelChange} />
          </div>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <PlanView />
      </div>
    </div>

    {/* Right workspace panel, docked full height like the left sidebar. */}
    <WorkspacePanel
      open={panelOpen}
      onClose={() => onPanelChange(false)}
      projectName={activeProject?.name ?? null}
      projectPath={activeProject?.path ?? null}
    />
    </div>
  );
}
