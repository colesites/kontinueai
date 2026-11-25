// Big photos and screenshots are scaled down before they're attached. Models
// refuse images over a few MB or about 8000 px, and a 20 MB camera photo used
// to vanish without a word. The longest side becomes MAX_EDGE, re-encoded as
// WebP (keeps transparency) at falling quality until it fits MAX_BYTES.

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 2048;
const QUALITIES = [0.9, 0.8, 0.7, 0.6];

/** The image as a data URL that fits model limits (unchanged when it already does). */
export async function fitImage(file: File, readAsDataURL: (file: Blob) => Promise<string>): Promise<{ url: string; mediaType: string }> {
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return { url: await readAsDataURL(file), mediaType: file.type };
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= MAX_IMAGE_BYTES) {
      return { url: await readAsDataURL(file), mediaType: file.type };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const quality of QUALITIES) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= MAX_IMAGE_BYTES) break;
    }
    if (!blob) throw new Error("Couldn't read that image.");
    return { url: await readAsDataURL(blob), mediaType: blob.type || "image/webp" };
  } finally {
    bitmap.close();
  }
}

/** "12.4 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
