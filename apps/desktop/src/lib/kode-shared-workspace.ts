// Project folders shared by every copy of the app (installed, dev, other
// builds), via ~/.kontinue/kode/workspace.json. Each webview has its own
// localStorage, so without this each copy showed a different project list.

import { invoke } from "@tauri-apps/api/core";

export type SharedFolder = { id: string; name: string; path: string };
export type SharedWorkspace = { folders: SharedFolder[]; chatFolder: Record<string, string> };

function trim(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

/**
 * Union of two workspaces by folder path. `base` wins: its folder ids are
 * kept, `extra`'s ids are mapped onto them, and base's chat assignments win.
 */
export function mergeWorkspaces(base: SharedWorkspace, extra: SharedWorkspace): SharedWorkspace {
  const folders = [...base.folders];
  const idMap = new Map<string, string>();
  for (const folder of base.folders) idMap.set(folder.id, folder.id);
  for (const folder of extra.folders) {
    const same = folders.find((f) => trim(f.path) === trim(folder.path));
    if (same) {
      idMap.set(folder.id, same.id);
      continue;
    }
    const id = folders.some((f) => f.id === folder.id) ? `${folder.id}-${folders.length}` : folder.id;
    folders.push({ ...folder, id });
    idMap.set(folder.id, id);
  }
  const chatFolder: Record<string, string> = {};
  for (const [chatId, folderId] of Object.entries(extra.chatFolder ?? {})) {
    const mapped = idMap.get(folderId);
    if (mapped) chatFolder[chatId] = mapped;
  }
  for (const [chatId, folderId] of Object.entries(base.chatFolder ?? {})) {
    if (folders.some((f) => f.id === folderId)) chatFolder[chatId] = folderId;
  }
  return { folders, chatFolder };
}

export async function readSharedWorkspace(): Promise<SharedWorkspace | null> {
  try {
    const value = await invoke<SharedWorkspace | null>("kode_shared_workspace_read");
    if (!value || !Array.isArray(value.folders)) return null;
    return { folders: value.folders, chatFolder: value.chatFolder ?? {} };
  } catch {
    return null;
  }
}

export async function writeSharedWorkspace(workspace: SharedWorkspace): Promise<void> {
  try {
    await invoke("kode_shared_workspace_write", { workspace });
  } catch {
    // Older backend or no home folder: the local list still works.
  }
}
