// Settings → General → Project order, used by the sidebar and the command
// palette. "added" keeps the order folders were added in.

import type { KodeChat, KodeProject } from "./kode-workspace";

export type ProjectOrder = "recent" | "added" | "name";

export function orderProjects(projects: KodeProject[], chats: KodeChat[], order: ProjectOrder): KodeProject[] {
  if (order === "added") return projects;
  if (order === "name") return [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const latest = new Map<string, number>();
  for (const chat of chats) {
    if (!chat.projectId) continue;
    latest.set(chat.projectId, Math.max(latest.get(chat.projectId) ?? 0, chat.updatedAt));
  }
  return projects
    .map((project, index) => ({ project, index }))
    .sort((a, b) => (latest.get(b.project.id) ?? 0) - (latest.get(a.project.id) ?? 0) || a.index - b.index)
    .map((entry) => entry.project);
}
