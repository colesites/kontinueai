// Shown when a Kode chat (or the next one) has no project: without one the
// agent can't read, edit or run anything, so say so and offer to pick one.

import { AlertTriangle, ChevronDown, Folder, FolderPlus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";

export function NoProjectBar({ onPick, inChat = false, className }: { onPick: (projectId: string) => void; inChat?: boolean; className?: string }) {
  const { projects, importFolder } = useKodeWorkspace();
  return (
    <div className={cn("flex min-w-0 items-center gap-2 text-label text-amber-600 dark:text-amber-400", className)}>
      <AlertTriangle size={12} className="shrink-0" />
      <span className="min-w-0 truncate">
        {inChat ? "This chat has no project, so Kode can't read, change or run files." : "No project: Kode won't be able to read, change or run files."}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="kontinue-3d flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-caption text-foreground/85 hover:text-foreground">
            {inChat ? "Move to project" : "Choose project"}
            <ChevronDown size={11} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-64 p-1.5">
          {projects.map((project) => (
            <DropdownMenuItem key={project.id} onSelect={() => onPick(project.id)} className="flex items-center gap-2.5 px-3 py-1.5">
              <Folder size={12} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-body">{project.name}</span>
            </DropdownMenuItem>
          ))}
          {projects.length ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => void importFolder()} className="flex items-center gap-2.5 px-3 py-1.5">
            <FolderPlus size={12} className="shrink-0" />
            <span className="text-body">Add project folder…</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
