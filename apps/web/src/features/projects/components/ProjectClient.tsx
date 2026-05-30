"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  FolderOpen,
  MessageSquare,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { cn } from "@repo/ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
};

export function ProjectClient() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId as Id<"projects"> | undefined;

  const project = useQuery(
    api.projects.getProject,
    projectId ? { projectId } : "skip",
  );
  const chats = useQuery(
    api.projects.listProjectChats,
    projectId ? { projectId } : "skip",
  );
  const deleteProject = useMutation(api.projects.deleteProject);
  const assignChatToProject = useMutation(api.projects.assignChatToProject);
  const [isDeleting, setIsDeleting] = useState(false);

  if (project === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <FolderOpen className="size-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">
          This project doesn’t exist or was deleted.
        </p>
        <Link href="/" className="text-sm text-primary hover:underline">
          Back to chats
        </Link>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!projectId) return;
    setIsDeleting(true);
    try {
      await deleteProject({ projectId });
      toast.success("Project deleted");
      router.push("/");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete project",
      );
      setIsDeleting(false);
    }
  };

  const handleRemoveChat = async (chatId: Id<"chats">) => {
    try {
      await assignChatToProject({ chatId, projectId: null });
      toast.success("Removed from project");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove chat");
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-5 py-6">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Back
      </Link>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: project?.color
                ? `${project.color}22`
                : undefined,
            }}
          >
            {project?.color ? (
              <span
                className="size-3.5 rounded-full"
                style={{ backgroundColor: project.color }}
              />
            ) : (
              <FolderOpen size={18} className="text-muted-foreground" />
            )}
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {project?.name ?? "…"}
            </h1>
            {project?.description && (
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                {project.description}
              </p>
            )}
            {project && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-foreground/5 px-2 py-0.5">
                  {STATUS_LABELS[project.status] ?? project.status}
                </span>
                <span>
                  {project.chatCount} chat{project.chatCount === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </div>
        </div>

        {project && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Project actions"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
              >
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                variant="destructive"
                disabled={isDeleting}
                onClick={() => void handleDelete()}
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete project</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <section className="flex-1">
        <h2 className="eyebrow mb-2 px-1">Chats</h2>
        {chats === undefined ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : chats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
            No chats in this project yet. Use a chat’s menu → “Move to project”.
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {chats.map((chat) => (
              <li
                key={chat._id}
                className="group flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-foreground/5"
              >
                <Link
                  href={`/chat/${chat._id}`}
                  className="flex flex-1 items-center gap-2.5 truncate"
                >
                  <MessageSquare
                    size={15}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="truncate text-sm">{chat.title}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void handleRemoveChat(chat._id)}
                  aria-label="Remove from project"
                  title="Remove from project"
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all",
                    "opacity-0 group-hover:opacity-100 hover:bg-foreground/8 hover:text-foreground",
                  )}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
