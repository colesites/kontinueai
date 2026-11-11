// Chat attachments saved into the project (.kode/attachments, kept out of git
// via .git/info/exclude) so agents can open them by path: Claude Code and Codex
// read images that way, and an agent can reuse a file (say, add a screenshot
// to a PR). Rust side: `kode_save_attachment` in src-tauri/src/lib.rs.

import { invoke } from "@tauri-apps/api/core";
import type { KodeContentPart } from "./kode-chat";

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

export type MessageImage = { path: string; mediaType: string; root?: string | null };

const IMAGE_BLOCK = /\n*```kode-image\n([\s\S]*?)\n```/g;
const ATTACHED_LINE = /\n*\[Attached: ([^\]\n]*)\]/;

/** Split a stored user message into its text and what was attached, so the
 *  attachments can be drawn above the bubble instead of inside it. Images
 *  saved in the project come as kode-image blocks; other files only by name. */
export function splitUserAttachments(content: string): { text: string; images: MessageImage[]; files: string[] } {
  const images: MessageImage[] = [];
  let text = content.replace(IMAGE_BLOCK, (block, json: string) => {
    try {
      const data = JSON.parse(json) as MessageImage;
      if (typeof data?.path === "string" && typeof data?.mediaType === "string") {
        images.push(data);
        return "";
      }
    } catch {
      // Not ours: leave the block where it is.
    }
    return block;
  });

  let files: string[] = [];
  const attached = text.match(ATTACHED_LINE);
  if (attached) {
    text = text.replace(ATTACHED_LINE, "");
    const shown = new Set(images.map((image) => displayName(image.path)));
    files = attached[1]
      .split(", ")
      .map((name) => name.trim())
      .filter((name) => name && !shown.has(name));
  }
  return { text: text.trim(), images, files };
}

/** Saved files are prefixed with a timestamp ("1731-shot.png"). */
export function displayName(path: string): string {
  return path.split("/").pop()?.replace(/^\d+-/, "") ?? path;
}

const MAX_INLINE_FILE_CHARS = 60_000;

/** The user turn sent to the model with its attachments, and the line saved
 *  with the message to say what was attached. */
export function attachmentContent(
  text: string,
  attachments: { filename?: string; mediaType: string; url?: string; text?: string }[],
): { content: string | KodeContentPart[]; note: string } {
  if (attachments.length === 0) return { content: text, note: "" };
  const files = attachments
    .filter((a) => !a.mediaType.startsWith("image/") && typeof a.text === "string")
    .map((a) => {
      const body = a.text!.length > MAX_INLINE_FILE_CHARS ? `${a.text!.slice(0, MAX_INLINE_FILE_CHARS)}\n…(truncated)` : a.text!;
      return `\n\n--- ${a.filename ?? "file"} ---\n${body}`;
    })
    .join("");
  const images = attachments.filter((a) => a.mediaType.startsWith("image/") && a.url);
  const fullText = `${text}${files}`;
  const note = `[Attached: ${attachments.map((a) => a.filename ?? "file").join(", ")}]`;
  if (images.length === 0) return { content: fullText, note };
  return {
    content: [
      { type: "text", text: fullText },
      ...images.map((a) => ({ type: "image_url" as const, image_url: { url: a.url as string } })),
    ],
    note,
  };
}
