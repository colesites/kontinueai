import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import {
  FILE_UPLOAD_ALLOWED_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@repo/core/file-upload.constants";

/** File attached to the composer, ready to send as an AI SDK file part. */
export type PendingAttachment = {
  kind: "image" | "document";
  /** Local URI for the thumbnail preview (images) or picker URI (documents). */
  uri: string;
  /** data: URL sent to the chat API (mirrors toFileUIPart on web). */
  dataUrl: string;
  mediaType: string;
  filename: string;
};

const MAX_ATTACHMENTS = 4;

export async function pickImageAttachments(
  existingCount: number,
): Promise<PendingAttachment[]> {
  const remaining = MAX_ATTACHMENTS - existingCount;
  if (remaining <= 0) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    // Keep request payloads reasonable — the chat route estimates input size.
    quality: 0.8,
    base64: true,
  });
  if (result.canceled) return [];

  return result.assets
    .filter((asset) => asset.base64)
    .map((asset, index) => {
      const mediaType = asset.mimeType ?? "image/jpeg";
      return {
        kind: "image" as const,
        uri: asset.uri,
        dataUrl: `data:${mediaType};base64,${asset.base64}`,
        mediaType,
        filename: asset.fileName ?? `image-${Date.now()}-${index}.jpg`,
      };
    });
}

/**
 * Documents (PDF & friends) ride along as data-URL file parts, same as
 * images — the chat route's convertToModelMessages hands them to the model,
 * and Claude/Gemini/GPT read PDFs natively. The web app only sends a filename
 * note for these; mobile sends the real content.
 */
export async function pickDocumentAttachments(
  existingCount: number,
): Promise<{ attachments: PendingAttachment[]; rejected: string[] }> {
  const remaining = MAX_ATTACHMENTS - existingCount;
  if (remaining <= 0) return { attachments: [], rejected: [] };

  const result = await DocumentPicker.getDocumentAsync({
    type: [...FILE_UPLOAD_ALLOWED_TYPES],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return { attachments: [], rejected: [] };

  const attachments: PendingAttachment[] = [];
  const rejected: string[] = [];

  for (const asset of result.assets.slice(0, remaining)) {
    const size = asset.size ?? 0;
    if (size > MAX_UPLOAD_SIZE_BYTES) {
      rejected.push(`${asset.name} (over ${Math.round(MAX_UPLOAD_SIZE_BYTES / 1024 / 1024)}MB)`);
      continue;
    }
    const mediaType = asset.mimeType ?? "application/octet-stream";
    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    attachments.push({
      kind: mediaType.startsWith("image/") ? "image" : "document",
      uri: asset.uri,
      dataUrl: `data:${mediaType};base64,${base64}`,
      mediaType,
      filename: asset.name,
    });
  }

  return { attachments, rejected };
}

/** A single reference photo for Canvas img2img, as a compact data URL. */
export async function pickReferenceImage(): Promise<PendingAttachment | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    // Tighter than chat attachments: this rides inside a JSON body.
    quality: 0.5,
    base64: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.base64) return null;
  const mediaType = asset.mimeType ?? "image/jpeg";
  return {
    kind: "image",
    uri: asset.uri,
    dataUrl: `data:${mediaType};base64,${asset.base64}`,
    mediaType,
    filename: asset.fileName ?? "reference.jpg",
  };
}

/** AI SDK v6 file UI parts for sendMessage({ files }). */
export function toFileUIParts(attachments: PendingAttachment[]) {
  return attachments.map((attachment) => ({
    type: "file" as const,
    mediaType: attachment.mediaType,
    filename: attachment.filename,
    url: attachment.dataUrl,
  }));
}
