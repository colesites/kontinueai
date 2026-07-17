import * as DocumentPicker from "expo-document-picker";

export type KodeAttachment = {
  uri: string;
  name: string;
  mimeType: string;
};

const MAX_FILES = 5;
const MAX_FILE_BYTES = 2_000_000;
const TEXT_EXTENSION =
  /\.(?:html?|css|js|jsx|ts|tsx|json|md|txt|xml|ya?ml|csv)$/i;

function supportedTextFile(name: string, mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "application/x-yaml" ||
    TEXT_EXTENSION.test(name)
  );
}

export async function pickKodeAttachments(existingCount: number): Promise<{
  attachments: KodeAttachment[];
  rejected: string[];
}> {
  const remaining = MAX_FILES - existingCount;
  if (remaining <= 0) {
    return { attachments: [], rejected: ["Kode accepts up to 5 files."] };
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return { attachments: [], rejected: [] };

  const attachments: KodeAttachment[] = [];
  const rejected: string[] = [];
  for (const asset of result.assets.slice(0, remaining)) {
    const mimeType = asset.mimeType || "application/octet-stream";
    if (!supportedTextFile(asset.name, mimeType)) {
      rejected.push(`${asset.name} is not a supported text or code file.`);
      continue;
    }
    if ((asset.size ?? 0) > MAX_FILE_BYTES) {
      rejected.push(`${asset.name} exceeds 2 MB.`);
      continue;
    }
    attachments.push({ uri: asset.uri, name: asset.name, mimeType });
  }
  if (result.assets.length > remaining) {
    rejected.push(`Only the first ${remaining} selected files were added.`);
  }
  return { attachments, rejected };
}

export function appendKodeAttachments(
  formData: FormData,
  attachments: KodeAttachment[],
): void {
  for (const attachment of attachments) {
    formData.append("files", {
      uri: attachment.uri,
      name: attachment.name,
      type: attachment.mimeType,
    } as unknown as Blob);
  }
}
