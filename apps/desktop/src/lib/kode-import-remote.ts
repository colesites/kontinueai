// Cross-device project context for imported chats.
//
// The continuation context lives in localStorage on the device that did the
// import. Convex keeps `importSource` (provider, session id, project path),
// so on another device we can still place the chat in the right project and
// rebuild a context, from the local transcript when this device has it too.

import type { StoredImportContext } from "./kode-import";
import { IMPORT_CONTEXT_VERSION } from "./kode-import-sync";

type Folder = { id: string; name: string; path: string };

export type RemoteImportSource = {
  provider: string;
  sessionId: string;
  projectPath?: string;
  lastActivity?: number;
  importedAt: number;
  syncedMessageCount?: number;
  syncedAt?: number;
};

function trimSlash(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

export function baseName(path: string): string {
  return trimSlash(path).split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/**
 * The local folder for a project path recorded on another device: exact path
 * first, then the same folder name (home folders differ between machines),
 * then a folder whose path ends with the same last two segments.
 */
export function resolveFolderForPath<T extends Folder>(
  projectPath: string | undefined | null,
  folders: T[],
): T | null {
  if (!projectPath) return null;
  const wanted = trimSlash(projectPath);
  const exact = folders.find((folder) => trimSlash(folder.path) === wanted);
  if (exact) return exact;
  const tail = wanted.split(/[\\/]/).filter(Boolean).slice(-2).join("/");
  const byTail = folders.filter((folder) =>
    trimSlash(folder.path).split(/[\\/]/).filter(Boolean).slice(-2).join("/") === tail,
  );
  if (byTail.length === 1) return byTail[0];
  const name = baseName(wanted).toLowerCase();
  const byName = folders.filter((folder) => baseName(folder.path).toLowerCase() === name);
  return byName.length === 1 ? byName[0] : null;
}

/**
 * A minimal context for an imported chat opened on a device that never saw
 * the import. `sourcePath` is filled in when the transcript is found locally
 * (same session synced via the agent's own cloud, or a shared home folder).
 */
export type RemoteContext = { contextPrompt: string; summary: string | null; projectName: string | null };

export function contextFromRemote(
  chatId: string,
  source: RemoteImportSource,
  local: { projectPath: string | null; sourcePath?: string },
  remote: RemoteContext | null = null,
): StoredImportContext {
  const project = local.projectPath ?? source.projectPath ?? null;
  if (remote?.contextPrompt) {
    // The full context from the importing device, with where things are here.
    const here = local.projectPath
      ? `Note: on this device the project is at ${local.projectPath}. Paths in the context below are from the device that imported the session.`
      : "Note: this project isn't open on this device. Ask the user to open it before making file changes.";
    return {
      ...contextFromRemote(chatId, source, local),
      projectName: remote.projectName ?? (project ? baseName(project) : undefined),
      summary: remote.summary ?? undefined,
      contextPrompt: `${here}\n\n${remote.contextPrompt}`,
    };
  }
  return {
    chatId,
    provider: source.provider,
    sessionId: source.sessionId,
    sourcePath: local.sourcePath,
    projectPath: local.projectPath,
    projectName: project ? baseName(project) : undefined,
    importedAt: source.importedAt,
    syncedAt: source.syncedAt,
    syncedMessageCount: source.syncedMessageCount,
    messageCount: source.syncedMessageCount ?? 0,
    lastActivity: source.lastActivity ?? null,
    filesChanged: [],
    redactions: 0,
    // No fingerprint: migration fills it in from the chat's own turns.
    autoSync: Boolean(local.sourcePath),
    version: 1,
    contextPrompt: [
      "## CONTINUATION CONTEXT (imported coding session)",
      "",
      `This chat was imported from ${source.provider} on another device.`,
      project ? `- Project: ${local.projectPath ?? `${project} (path on the other device)`}` : "",
      `- Original session: ${source.sessionId}`,
      local.projectPath
        ? "Inspect the files on disk before editing; this device's copy may differ from the other device."
        : "This project isn't open on this device. Ask the user to open it before making file changes.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export { IMPORT_CONTEXT_VERSION };

/** Fingerprint of what we last uploaded per chat, so unchanged contexts aren't resent. */
export function uploadKey(context: Pick<StoredImportContext, "contextPrompt" | "summary" | "projectName">): string {
  let hash = 0x811c9dc5;
  const text = `${context.contextPrompt}\u0000${context.summary ?? ""}\u0000${context.projectName ?? ""}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
