import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PillButton } from "@/components/settings/settings-ui";
import { Dialog, DialogBody, DialogContent, DialogFooter, fieldClassName } from "@/components/ui/dialog";
import { useAppSettings } from "@/lib/app-settings";
import { orderProjects } from "@/lib/kode-project-order";
import { useKodeWorkspace, type KodeChat } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronsDownUp,
  Folder,
  Plus,
  MoreHorizontal,
  Pencil,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="sm"
        eyebrow="Project"
        title={isEditing ? "Edit project" : "New project"}
        description="Group related chats together in one workspace."
      >
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3.5 pb-4">
            <div>
              <label htmlFor="project-name" className="mb-1 block text-label font-medium text-foreground/80">
                Name
              </label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kontinue AI"
                className={fieldClassName("h-9")}
              />
            </div>
            <div>
              <label htmlFor="project-description" className="mb-1 block text-label font-medium text-foreground/80">
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                className={fieldClassName("h-16 resize-none py-2")}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <PillButton onClick={onClose}>Cancel</PillButton>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="kontinue-3d-primary flex h-8 items-center rounded-full px-3.5 text-label font-medium disabled:opacity-40"
            >
              {isEditing ? "Save changes" : "Create project"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const LeftSidebarProjects = () => {
  const { activeTab, projects: unorderedProjects, chats, draftProjectId, importFolder, removeFolder, newChat } =
    useKodeWorkspace();
  // Settings → General → Project order.
  const { projectOrder } = useAppSettings();
  const projects = useMemo(
    () => orderProjects(unorderedProjects, chats, projectOrder),
    [unorderedProjects, chats, projectOrder],
  );
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
    if (activeTab !== "kode") {
      setProjectModalState({ open: true, project: null });
    } else {
      void importFolder();
    }
  };

  return (
    <section className="relative">
      <div className="mb-1 flex h-6 items-center justify-between pr-1 pl-2">
        <h2 className="text-label font-medium text-muted-foreground">Projects</h2>
        <div className="flex items-center gap-0.5">
          {/* 1. Collapse All */}
          <button
            type="button"
            onClick={collapseAll}
            title="Collapse all"
            aria-label="Collapse all"
            className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground"
          >
            <ChevronsDownUp size={14} strokeWidth={1.5} />
          </button>

          {/* 2. Options Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Project options"
                className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground data-[state=open]:text-foreground"
              >
                <MoreHorizontal size={14} strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="w-48">
              <DropdownMenuItem onClick={handleAddProject}>
                <Plus size={13.5} strokeWidth={1.25} />
                <span>{activeTab !== "kode" ? "New project" : "Import folder"}</span>
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
            title={activeTab !== "kode" ? "New project" : "Import project folder"}
            aria-label={activeTab !== "kode" ? "New project" : "Import project folder"}
            className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground"
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <button
          type="button"
          onClick={handleAddProject}
          className="flex w-full items-start gap-2 rounded-[14px] px-2 py-1.5 text-left text-label leading-relaxed text-muted-foreground/80 transition-colors kontinue-hover hover:text-foreground"
        >
          <Plus size={14} strokeWidth={1.5} className="mt-px shrink-0" />
          {activeTab === "kode"
            ? "Add a project folder so Kode can read and change its files"
            : "Create a project to group related chats"}
        </button>
      ) : (
        <div className="flex flex-col gap-px">
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
                    "group/project flex h-[30px] items-center gap-1.5 rounded-full pr-1 text-body text-foreground/80 transition-colors kontinue-hover hover:text-foreground",
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
                    className="flex h-full shrink-0 items-center pl-2"
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
                    className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Folder
                      size={14}
                      strokeWidth={1.5}
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
                    className="hidden size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground group-hover/project:flex"
                  >
                    <SquarePen size={14} strokeWidth={1.5} />
                  </button>

                  {/* 3-Dot Dropdown Menu for Project Row */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Project actions"
                        className="hidden size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground group-hover/project:flex data-[state=open]:flex data-[state=open]:text-foreground"
                      >
                        <MoreHorizontal size={14} strokeWidth={1.5} />
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
                        <span>{activeTab !== "kode" ? "Remove project" : "Remove folder"}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {!isCollapsed && (
                  <div className="ml-[15px] flex flex-col gap-px border-l border-border pl-1.5">
                    {projectChats.length === 0 ? (
                      <p className="px-2.5 py-1.5 text-label text-muted-foreground/70">
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
                            className="h-7 rounded-full px-2.5 text-left text-label text-muted-foreground transition-colors hover:text-foreground"
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
