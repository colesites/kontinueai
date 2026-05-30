"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderOpen, Plus } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { cn } from "@repo/ui/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/ui/components/ui/sidebar";
import { ProjectCreateDialog } from "./ProjectCreateDialog";

type SidebarProjectsSectionProps = {
  pathname: string;
  onNavigate: () => void;
};

export function SidebarProjectsSection({
  pathname,
  onNavigate,
}: SidebarProjectsSectionProps) {
  const projects = useQuery(api.projects.listProjects, {});
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <SidebarGroup>
        <div className="flex items-center justify-between pr-1">
          <SidebarGroupLabel className="px-2 eyebrow">Projects</SidebarGroupLabel>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="New project"
            title="New project"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
        </div>

        <SidebarGroupContent>
          <SidebarMenu>
            {projects === undefined ? (
              <div className="flex items-center justify-center py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : projects.length === 0 ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-1 w-full rounded-xl border border-dashed border-sidebar-border/60 px-3 py-3 text-center text-xs text-sidebar-foreground/60 transition-colors hover:border-sidebar-border hover:text-sidebar-foreground"
              >
                Create a project to group chats
              </button>
            ) : (
              projects.map((project) => {
                const href = `/projects/${project._id}`;
                const isActive = pathname === href;
                return (
                  <SidebarMenuItem key={project._id}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={href} onClick={onNavigate}>
                        <span
                          className="flex size-4 shrink-0 items-center justify-center"
                          aria-hidden
                        >
                          {project.color ? (
                            <span
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                          ) : (
                            <FolderOpen size={14} />
                          )}
                        </span>
                        <span className="flex-1 truncate">{project.name}</span>
                        {project.chatCount > 0 && (
                          <span
                            className={cn(
                              "ml-auto text-[10px] tabular-nums text-muted-foreground/70",
                            )}
                          >
                            {project.chatCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <ProjectCreateDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
