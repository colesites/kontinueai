import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useKodeWorkspace, type KodeChat } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronsDownUp,
  Folder,
  Plus,
  MoreVertical,
  Pin,
  Pencil,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { MoveProjectDialog } from "@/components/kode/ProjectMove";
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

type ProjectModalProps = {
  initialProject?: { id: string; name: string; description?: string } | null;
  onClose: () => void;
};

/* ── Unified Project Modal for New & Edit project (Image 40) ── */
function ProjectModal({ initialProject, onClose }: ProjectModalProps) {
  const { createProjectRecord, renameProjectRecord } = useKodeWorkspace();
  const [name, setName] = useState(initialProject?.name ?? "");
  const [description, setDescription] = useState(initialProject?.description ?? "");
  const [submitting, setSubmitting] = useState(false);

  const isEditing = Boolean(initialProject);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    try {
      if (isEditing && initialProject) {
        await renameProjectRecord(initialProject.id, name.trim(), description.trim() || undefined);
      } else {
        await createProjectRecord({
          name: name.trim(),
          description: description.trim() || undefined,
        });
      }
      onClose();
    } catch (err) {
      console.error("[ProjectModal] Failed to save project:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[400px] rounded-2xl liquid-glass-dropdown p-5 text-popover-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">
              PROJECT
            </p>
            <h2 className="text-base font-semibold text-foreground">
              {isEditing ? "Edit project" : "New project"}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              Group related chats together in one workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-3">
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kontinue AI"
                className="w-full h-9 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-purple-500/50 transition-colors"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                className="w-full h-16 rounded-2xl border border-border bg-secondary/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-purple-500/50 transition-colors resize-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="kontinue-3d rounded-full px-3 py-1.5 text-xs font-medium text-foreground/80 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="kontinue-3d-primary rounded-full font-semibold px-3.5 py-1.5 text-xs disabled:opacity-30 cursor-pointer"
            >
              {isEditing ? "Save changes" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const LeftSidebarProjects = () => {
  const { activeTab, projects, chats, draftProjectId, importFolder, removeFolder, newChat } =
    useKodeWorkspace();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [moving, setMoving] = useState<{ name: string; path: string; chatIds: string[] } | null>(null);
  const [visible, setVisible] = useState<Record<string, number>>({});
  const [projectModalState, setProjectModalState] = useState<{
    open: boolean;
    project?: { id: string; name: string; description?: string } | null;
  }>({ open: false });

  const collapseAll = () =>
    setCollapsed(Object.fromEntries(projects.map((p) => [p.id, true])));

  const handleAddProject = () => {
    if (activeTab === "home") {
      setProjectModalState({ open: true, project: null });
    } else {
      void importFolder();
    }
  };

  return (
    <section className="relative">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11.5px] font-medium text-muted-foreground">
          Projects
        </span>
        <div className="flex items-center gap-0.5">
          {/* 1. Collapse All */}
          <button
            type="button"
            onClick={collapseAll}
            title="Collapse all"
            aria-label="Collapse all"
            className="size-5 flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronsDownUp size={13} strokeWidth={1.25} />
          </button>

          {/* 2. Options Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Project options"
                className="size-5 flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:text-foreground transition-colors cursor-pointer"
              >
                <MoreVertical size={13} strokeWidth={1.25} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="w-48">
              <DropdownMenuItem onClick={handleAddProject}>
                <Plus size={13.5} strokeWidth={1.25} />
                <span>{activeTab === "home" ? "New project" : "Import folder"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={collapseAll}>
                <ChevronsDownUp size={13.5} strokeWidth={1.25} />
                <span>Collapse all</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 3. Plus Button */}
          <button
            type="button"
            onClick={handleAddProject}
            title={activeTab === "home" ? "New project" : "Import project folder"}
            aria-label={activeTab === "home" ? "New project" : "Import project folder"}
            className="size-5 flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          >
            <Plus size={13} strokeWidth={1.25} />
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex items-center gap-2 px-1 py-1 text-[11.5px] text-muted-foreground">
          <Pin size={12} strokeWidth={1.25} className="shrink-0 text-muted-foreground" />
          {activeTab === "kode" ? (
            <button type="button" onClick={handleAddProject} className="cursor-pointer text-left hover:text-foreground">
              Add a project folder so Kode can read and change its files
            </button>
          ) : (
            <span>Pin projects to keep them here</span>
          )}
        </div>
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
                    "group/project flex items-center gap-1.5 rounded-full pr-1 text-[13px] text-foreground/80 transition-colors hover:bg-accent hover:text-foreground",
                    isDraftTarget && "bg-accent text-foreground",
                  )}
                >
                  <button
                    type="button"
                    aria-label={isCollapsed ? `Show ${project.name} chats` : `Hide ${project.name} chats`}
                    onClick={() =>
                      setCollapsed((current) => ({
                        ...current,
                        [project.id]: !isCollapsed,
                      }))
                    }
                    className="flex shrink-0 cursor-pointer items-center py-1.5 pl-1.5"
                  >
                    <ChevronRight
                      size={13}
                      className={cn(
                        "shrink-0 text-foreground/35 transition-transform",
                        !isCollapsed && "rotate-90",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    // Clicking a project starts a new chat in it (like Claude Code / Codex).
                    onClick={() => newChat(project.id)}
                    title={`New chat in ${project.name}`}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-1.5 text-left"
                  >
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

                  {/* Per-project actions — reveal on hover */}
                  <button
                    type="button"
                    onClick={() => newChat(project.id)}
                    title="New chat"
                    aria-label="New chat in project"
                    className="hidden shrink-0 size-5 flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground group-hover/project:flex transition-colors cursor-pointer"
                  >
                    <SquarePen size={13} strokeWidth={1.25} />
                  </button>

                  {/* 3-Dot Dropdown Menu for Project Row */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Project actions"
                        className="hidden shrink-0 size-5 flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground group-hover/project:flex data-[state=open]:flex data-[state=open]:bg-accent data-[state=open]:text-foreground transition-colors cursor-pointer"
                      >
                        <MoreVertical size={13} strokeWidth={1.25} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4} className="w-48">
                      <DropdownMenuItem onClick={() => newChat(project.id)}>
                        <SquarePen size={13.5} strokeWidth={1.25} />
                        <span>New chat</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setProjectModalState({
                            open: true,
                            project: { id: project.id, name: project.name },
                          });
                        }}
                      >
                        <Pencil size={13.5} strokeWidth={1.25} />
                        <span>Edit project</span>
                      </DropdownMenuItem>
                      {activeTab === "kode" && project.path ? (
                        <DropdownMenuItem
                          onClick={() => setMoving({ name: project.name, path: project.path, chatIds: projectChats.map((chat) => chat.id) })}
                        >
                          <ArrowRightLeft size={13.5} strokeWidth={1.25} />
                          <span>Move to another machine</span>
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => removeFolder(project.id)}
                      >
                        <Trash2 size={13.5} strokeWidth={1.25} />
                        <span>{activeTab === "home" ? "Remove project" : "Remove folder"}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {!isCollapsed && (
                  <div className="ml-[1.45rem] flex flex-col gap-0.5 border-l border-border pl-1.5">
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

      {/* Project Modal for New & Edit project */}
      {projectModalState.open && (
        <ProjectModal
          initialProject={projectModalState.project}
          onClose={() => setProjectModalState({ open: false })}
        />
      )}
      {moving ? (
        <MoveProjectDialog project={moving} chatIds={moving.chatIds} onClose={() => setMoving(null)} />
      ) : null}
    </section>
  );
};

export default LeftSidebarProjects;
