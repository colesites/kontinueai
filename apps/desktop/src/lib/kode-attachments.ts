// Chat attachments saved into the project (.kode/attachments, kept out of git
// via .git/info/exclude) so agents can open them by path: Claude Code and Codex
// read images that way, and an agent can reuse a file (say, add a screenshot
// to a PR). Rust side: `kode_save_attachment` in src-tauri/src/lib.rs.

import { invoke } from "@tauri-apps/api/core";

export type SavedAttachment = { filename: string; path: string; mediaType: string };

type AttachmentLike = { filename?: string; url?: string; mediaType: string; text?: string };

/** Base64 payload of an attachment, or null when there's nothing to save. */
export function attachmentBase64(attachment: AttachmentLike): string | null {
  const url = attachment.url ?? "";
  const dataUrl = url.match(/^data:[^,]*?(;base64)?,(.*)$/s);
  if (dataUrl) {
    if (dataUrl[1]) return dataUrl[2];
    return utf8ToBase64(decodeURIComponent(dataUrl[2]));
  }
  if (typeof attachment.text === "string") return utf8ToBase64(attachment.text);
  return null;
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Save each attachment into the project; failures are skipped, not fatal. */
export async function saveAttachmentsToProject(
  root: string,
  attachments: AttachmentLike[],
): Promise<SavedAttachment[]> {
  const saved: SavedAttachment[] = [];
  for (const attachment of attachments) {
    const data = attachmentBase64(attachment);
    if (!data) continue;
    const filename = attachment.filename || "attachment";
    try {
      const path = await invoke<string>("kode_save_attachment", { root, filename, data });
      saved.push({ filename, path, mediaType: attachment.mediaType });
    } catch {
      // Too big or not writable: the model still gets the inline copy.
    }
  }
  return saved;
}

/** The note added to the prompt so the agent knows where the files are. */
export function savedAttachmentsNote(saved: SavedAttachment[]): string {
  if (saved.length === 0) return "";
  const lines = saved.map((file) => `- ${file.path} (${file.mediaType || "file"}, attached as "${file.filename}")`);
  return `\n\n[Attached files are also saved in the project, so you can open or reuse them:\n${lines.join("\n")}]`;
}
