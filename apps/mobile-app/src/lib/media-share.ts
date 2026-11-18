import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

function safeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "file";
}

function extensionFor(url: string, fallback: string): string {
  const dataMime = url.match(/^data:([^;,]+)/)?.[1];
  if (dataMime && MIME_EXTENSIONS[dataMime]) return MIME_EXTENSIONS[dataMime]!;
  const path = url.split("?")[0] ?? "";
  const ext = path.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  return ext ? ext.toLowerCase() : fallback;
}

/**
 * Copies a remote URL or a `data:` URL into the cache directory so it can be
 * handed to the OS share sheet (which is where "Save Image", "Save to Files"
 * and every other app live on both platforms).
 */
async function toLocalFile(url: string, baseName: string, fallbackExt: string) {
  const name = safeFilename(baseName.replace(/\.[a-z0-9]{2,5}$/i, ""));
  const ext = extensionFor(url, fallbackExt);
  const localUri = `${FileSystem.cacheDirectory}${name}-${Date.now()}.${ext}`;

  if (url.startsWith("data:")) {
    const base64 = url.slice(url.indexOf(",") + 1);
    await FileSystem.writeAsStringAsync(localUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return localUri;
  }
  const result = await FileSystem.downloadAsync(url, localUri);
  if (result.status >= 400) {
    throw new Error("The file couldn't be downloaded.");
  }
  return result.uri;
}

/** Save or send a generated image / video / file through the share sheet. */
export async function shareMediaFile(
  url: string,
  options: { filename?: string; mimeType?: string; fallbackExt?: string } = {},
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    if (url.startsWith("http")) await WebBrowser.openBrowserAsync(url);
    return;
  }
  const localUri = await toLocalFile(
    url,
    options.filename ?? "kontinue",
    options.fallbackExt ?? "png",
  );
  await Sharing.shareAsync(localUri, {
    mimeType: options.mimeType,
    dialogTitle: options.filename,
  });
}

/** Open a hosted document (PDF, sheet…) in the in-app browser viewer. */
export async function openRemoteFile(url: string): Promise<void> {
  if (url.startsWith("data:")) {
    await shareMediaFile(url, { filename: "attachment", fallbackExt: "bin" });
    return;
  }
  await WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  });
}
