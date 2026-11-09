import { useState } from "react";
import { FolderTree, Globe, X } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import PlanView from "@/components/view/PlanView";
import { TextAnnotator } from "@/components/kode/TextAnnotator";
import { WorkspacePanel } from "@/components/panel/WorkspacePanel";
import { FilesTab } from "@/components/panel/FilesTab";
import { BrowserTab } from "@/components/panel/BrowserTab";
import { useSidebar } from "@/components/ui/sidebar";
import FloatingSidebarButtonGroup from "@/components/layout/sidebar/FloatingSidebarButtonGroup";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { useIsFullscreen } from "@/hooks/use-is-fullscreen";
import { cn } from "@/lib/utils";
import { useKeybinding } from "@/lib/kode-keybindings";
import { ImportSessionModal } from "@/components/kode/KodeSessionImport";
import { SnapshotDialog } from "@/components/kode/SnapshotDialog";

type DeskTab =
  | { id: "chat"; kind: "chat" }
  | { id: "files"; kind: "files" }
  | { id: string; kind: "browser"; initialUrl: string | null; url: string | null };

type KodeViewProps = {
  panelOpen: boolean;
  onPanelChange: (open: boolean) => void;
};

export default function KodeView(_props: KodeViewProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isFullscreen = useIsFullscreen();
  const { projects, chats, activeChatId, draftProjectId, newChat } = useKodeWorkspace();
  const [dialog, setDialog] = useState<"import" | "snapshot" | null>(null);

  const activeProjectId =
    (activeChatId
      ? chats.find((chat) => chat.id === activeChatId)?.projectId
      : draftProjectId) ?? null;
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null;
  const activeChat =
    (activeChatId ? chats.find((chat) => chat.id === activeChatId) : null) ??
    null;
  const [filesPath, setFilesPath] = useState<string | null>(null);
  useKeybinding("kode.newChat", () => newChat(activeProjectId));
  useKeybinding("kode.importSession", () => setDialog("import"));
  useKeybinding("kode.snapshot", () => setDialog("snapshot"));
  const [tabs, setTabs] = useState<DeskTab[]>([{ id: "chat", kind: "chat" }]);
  const [activeId, setActiveId] = useState("chat");
  // The right panel belongs to a chat (and a tab): closed by default, and
  // remembered per chat instead of following you everywhere.
  const [panelByKey, setPanelByKey] = useState<Record<string, boolean>>({});
  const panelKey = `${activeChatId ?? `draft:${draftProjectId ?? "none"}`}|${activeId}`;
  const panelOpen = panelByKey[panelKey] ?? false;
  const onPanelChange = (open: boolean) => setPanelByKey((current) => ({ ...current, [panelKey]: open }));
  useKeybinding("app.panel", () => setPanelByKey((current) => ({ ...current, [panelKey]: !(current[panelKey] ?? false) })));
  const extraTabs = tabs.filter((tab) => tab.kind !== "chat");

  const openFilesTab = (path?: string | null) => {
    if (path) setFilesPath(path);
    setTabs((current) =>
      current.some((tab) => tab.kind === "files")
        ? current
        : [...current, { id: "files", kind: "files" }],
    );
    setActiveId("files");
  };

  const openBrowserTab = (url: string | null) => {
    const id = `browser-${crypto.randomUUID()}`;
    setTabs((current) => [
      ...current,
      { id, kind: "browser", initialUrl: url, url },
    ]);
    setActiveId(id);
  };

  const closeTab = (id: string) => {
    setTabs((current) => current.filter((tab) => tab.id !== id));
    setActiveId((current) => (current === id ? "chat" : current));
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
    <TextAnnotator />
    {dialog === "import" ? (
      <ImportSessionModal projectPath={activeProject?.path ?? null} projectName={activeProject?.name ?? null} onClose={() => setDialog(null)} />
    ) : dialog === "snapshot" ? (
      <SnapshotDialog projectId={activeProjectId} projectPath={activeProject?.path ?? null} onClose={() => setDialog(null)} />
    ) : null}
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {isCollapsed && <FloatingSidebarButtonGroup />}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className={cn("absolute inset-0 flex flex-col", activeId !== "chat" && "invisible pointer-events-none")}>
          <PlanView />
        </div>
        {tabs.map((tab) =>
          tab.kind === "files" ? (
            <div
              key={tab.id}
              className={cn(
                "absolute inset-0 flex flex-col pt-11",
                activeId !== tab.id && "invisible pointer-events-none",
              )}
            >
              {activeProject?.path ? (
                <FilesTab
                  projectPath={activeProject.path}
                  active={activeId === tab.id}
                  initialPath={filesPath}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
                  Open a project folder to browse its files.
                </div>
              )}
            </div>
          ) : tab.kind === "browser" ? (
            <div
              key={tab.id}
              className={cn(
                "absolute inset-0 flex flex-col pt-11",
                activeId !== tab.id && "invisible pointer-events-none",
              )}
            >
              <BrowserTab
                label={tab.id}
                active={activeId === tab.id}
                initialUrl={tab.initialUrl}
                onUrlChange={(url) =>
                  setTabs((current) => {
                    const item = current.find((entry) => entry.id === tab.id);
                    if (!item || item.kind !== "browser" || item.url === url) return current;
                    return current.map((entry) =>
                      entry.id === tab.id && entry.kind === "browser" ? { ...entry, url } : entry,
                    );
                  })
                }
              />
            </div>
          ) : null,
        )}

        {activeId === "chat" ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24 bg-gradient-to-b from-background via-background/75 to-transparent"
          />
        ) : null}

        <header
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 z-30 flex h-11 items-center justify-between gap-3 px-4",
            isCollapsed && (isFullscreen ? "pl-[132px]" : "pl-[214px]"),
          )}
        >
          <div
            data-tauri-drag-region
            className="pointer-events-auto flex h-full min-w-0 flex-1 items-center gap-2"
          >
            {activeChat ? (
              <button
                type="button"
                onClick={() => setActiveId("chat")}
                className={cn(
                  "flex min-w-0 items-center gap-2 text-left",
                  activeId === "chat" ? "cursor-default" : "cursor-pointer",
                )}
              >
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
              </button>
            ) : null}
            {extraTabs.map((tab) => {
              const label = tab.kind === "files" ? "Files" : browserLabel(tab.url);
              const selected = tab.id === activeId;
              return (
                <div
                  key={tab.id}
                  className={cn(
                    "flex h-7 max-w-[12rem] shrink-0 items-center rounded-full text-[12px]",
                    selected
                      ? "bg-black/[0.06] text-foreground dark:bg-white/[0.08]"
                      : "text-foreground/55 hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
                  )}
                >
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveId(tab.id);
                    }}
                    className="flex h-full min-w-0 cursor-pointer items-center gap-1.5 pl-2"
                  >
                    {tab.kind === "files" ? (
                      <FolderTree size={12} className="shrink-0" />
                    ) : (
                      <Globe size={12} className="shrink-0" />
                    )}
                    <span className="truncate">{label}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${label}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="ml-1 mr-1 flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground/40 hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>

          {!panelOpen ? (
            <div className="pointer-events-auto">
              <Topbar panelOpen={panelOpen} onPanelChange={onPanelChange} />
            </div>
          ) : null}
        </header>
      </div>
    </div>

    {/* Right workspace panel, docked full height like the left sidebar. */}
    <WorkspacePanel
      open={panelOpen}
      onClose={() => onPanelChange(false)}
      projectName={activeProject?.name ?? null}
      projectPath={activeProject?.path ?? null}
      onOpenFilesTab={openFilesTab}
      onOpenBrowserTab={openBrowserTab}
    />
    </div>
  );
}

function browserLabel(url: string | null) {
  if (!url) return "Browser";
  try {
    return new URL(url).host || "Browser";
  } catch {
    return "Browser";
  }
}
