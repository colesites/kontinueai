import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useKodeWorkspace, type KodeChat } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronsDownUp,
  Folder,
  FolderPlus,
  MoreHorizontal,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import SidebarChatRow from "./SidebarChatRow";
import { ProjectStatusRollup } from "./ProjectStatusRollup";

const PAGE_SIZE = 5;

const sortChats = (a: KodeChat, b: KodeChat) => {
  if (a.pinnedAt !== null || b.pinnedAt !== null) {
    if (a.pinnedAt === null) return 1;
    if (b.pinnedAt === null) return -1;
    if (a.pinnedAt !== b.pinnedAt) return b.pinnedAt - a.pinnedAt;
  }
  return b.updatedAt - a.updatedAt;
};

const LeftSidebarProjects = () => {
  const { projects, chats, draftProjectId, importFolder, removeFolder, newChat } =
    useKodeWorkspace();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState<Record<string, number>>({});

  const collapseAll = () =>
    setCollapsed(Object.fromEntries(projects.map((p) => [p.id, true])));

  return (
    <section className="relative">
      {/* Floating action buttons — always visible, not a fixed header bar. */}
      <div className="absolute right-0 top-0 z-10 flex items-center gap-0.5">
        <button
          type="button"
          onClick={collapseAll}
          title="Collapse all"
          aria-label="Collapse all"
          className="rounded-md p-1 text-foreground/35 transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <ChevronsDownUp size={13} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Project options"
              className="rounded-md p-1 text-foreground/35 transition-colors hover:bg-white/[0.06] hover:text-foreground data-[state=open]:text-foreground"
            >
              <MoreHorizontal size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => void importFolder()}>
              <FolderPlus size={14} /> Import folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={collapseAll}>
              <ChevronsDownUp size={14} /> Collapse all
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => void importFolder()}
          title="Import folder"
          aria-label="Import folder"
          className="rounded-md p-1 text-foreground/35 transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <FolderPlus size={13} />
        </button>
      </div>

      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
        Projects
      </p>

      {projects.length === 0 ? (
        <button
          type="button"
          onClick={() => void importFolder()}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-white/[0.08] px-2.5 py-2 text-[12px] text-foreground/45 transition-colors hover:border-white/[0.16] hover:text-foreground/70"
        >
          <FolderPlus size={13} className="shrink-0" />
          Import a folder
        </button>
      ) : (
        <div className="flex flex-col gap-0.5">
          {projects.map((project) => {
            const isCollapsed = collapsed[project.id] ?? false;
            const projectChats = chats
              .filter((chat) => chat.projectId === project.id)
              .sort(sortChats);
            const limit = visible[project.id] ?? PAGE_SIZE;
            const shownChats = projectChats.slice(0, limit);
            const isDraftTarget = draftProjectId === project.id;

            return (
              <div key={project.id}>
                <div
                  className={cn(
                    "group/project flex items-center gap-1.5 rounded-lg pr-1 text-[13px] text-foreground/75 transition-colors hover:bg-white/[0.055] hover:text-foreground",
                    isDraftTarget && "bg-white/[0.045] text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((current) => ({
                        ...current,
                        [project.id]: !isCollapsed,
                      }))
                    }
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-1.5 text-left"
                  >
                    <ChevronRight
                      size={13}
                      className={cn(
                        "shrink-0 text-foreground/35 transition-transform",
                        !isCollapsed && "rotate-90",
                      )}
                    />
                    <Folder
                      size={13}
                      className="shrink-0"
                      style={{ color: project.hue }}
                    />
                    <span className="truncate">{project.name}</span>
                    {isCollapsed && (
                      <ProjectStatusRollup
                        chatIds={projectChats.map((chat) => chat.id)}
                      />
                    )}
                  </button>

                  {/* Per-project actions — reveal on hover. */}
                  <button
                    type="button"
                    onClick={() => newChat(project.id)}
                    title="New chat"
                    aria-label="New chat in project"
                    className="hidden shrink-0 rounded-md p-1 text-foreground/40 hover:text-foreground group-hover/project:block"
                  >
                    <SquarePen size={13} />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Project actions"
                        className="hidden shrink-0 rounded-md p-1 text-foreground/40 hover:text-foreground group-hover/project:block data-[state=open]:block"
                      >
                        <MoreHorizontal size={13} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => newChat(project.id)}>
                        <SquarePen size={14} /> New chat
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => removeFolder(project.id)}
                      >
                        <Trash2 size={14} /> Remove folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {!isCollapsed && (
                  <div className="ml-[1.45rem] flex flex-col gap-0.5 border-l border-white/[0.06] pl-1.5">
                    {projectChats.length === 0 ? (
                      <p className="px-2 py-1.5 text-[11.5px] text-foreground/30">
                        No chats yet
                      </p>
                    ) : (
                      <>
                        {shownChats.map((chat) => (
                          <SidebarChatRow key={chat.id} chat={chat} />
                        ))}
                        {projectChats.length > limit && (
                          <button
                            type="button"
                            onClick={() =>
                              setVisible((current) => ({
                                ...current,
                                [project.id]: limit + PAGE_SIZE,
                              }))
                            }
                            className="px-2 py-1 text-left text-[12px] text-foreground/35 hover:text-foreground/70"
                          >
                            Show more
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default LeftSidebarProjects;
