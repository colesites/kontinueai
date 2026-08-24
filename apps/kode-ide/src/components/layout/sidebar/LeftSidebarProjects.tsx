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
        className="relative w-full max-w-[400px] rounded-2xl border border-white/[0.1] bg-popover p-5 shadow-2xl backdrop-blur-2xl text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 mb-1">
              PROJECT
            </p>
            <h2 className="text-base font-semibold text-white">
              {isEditing ? "Edit project" : "New project"}
            </h2>
            <p className="text-xs text-white/50 leading-relaxed mt-0.5">
              Group related chats together in one workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full text-white/40 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-3">
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kontinue AI"
                className="w-full h-9 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-white/30 transition-colors"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Description <span className="text-white/40 font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                className="w-full h-16 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-white/25 outline-none focus:border-white/30 transition-colors resize-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="rounded-lg bg-white text-black font-semibold px-3.5 py-1.5 text-xs hover:bg-white/90 disabled:opacity-30 transition-colors"
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
        <span className="text-[11.5px] font-medium text-[#7c7c82]">
          Projects
        </span>
        <div className="flex items-center gap-0.5">
          {/* 1. Collapse All */}
          <button
            type="button"
            onClick={collapseAll}
            title="Collapse all"
            aria-label="Collapse all"
            className="size-5 flex items-center justify-center rounded-md text-[#7c7c82] hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <ChevronsDownUp size={13} strokeWidth={1.25} />
          </button>

          {/* 2. Options Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Project options"
                className="size-5 flex items-center justify-center rounded-md text-[#7c7c82] hover:bg-white/[0.06] hover:text-white data-[state=open]:text-white transition-colors"
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
            className="size-5 flex items-center justify-center rounded-md text-[#7c7c82] hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <Plus size={13} strokeWidth={1.25} />
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex items-center gap-2 px-1 py-1 text-[11.5px] text-[#5c5c62]">
          <Pin size={12} strokeWidth={1.25} className="shrink-0 text-[#5c5c62]" />
          <span>Pin projects to keep them here</span>
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

                  {/* Per-project actions — reveal on hover */}
                  <button
                    type="button"
                    onClick={() => newChat(project.id)}
                    title="New chat"
                    aria-label="New chat in project"
                    className="hidden shrink-0 size-5 flex items-center justify-center rounded-md text-white/50 hover:bg-white/[0.08] hover:text-white group-hover/project:flex transition-colors"
                  >
                    <SquarePen size={13} strokeWidth={1.25} />
                  </button>

                  {/* 3-Dot Dropdown Menu for Project Row */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Project actions"
                        className="hidden shrink-0 size-5 flex items-center justify-center rounded-md text-white/50 hover:bg-white/[0.08] hover:text-white group-hover/project:flex data-[state=open]:flex data-[state=open]:bg-white/[0.08] data-[state=open]:text-white transition-colors"
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

      {/* Project Modal for New & Edit project */}
      {projectModalState.open && (
        <ProjectModal
          initialProject={projectModalState.project}
          onClose={() => setProjectModalState({ open: false })}
        />
      )}
    </section>
  );
};

export default LeftSidebarProjects;
