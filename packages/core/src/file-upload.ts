/**
 * Client-side helper functions for file uploads to Vercel Blob
 */
import { assertValidUploadFile, validateFile } from "./file-upload.validators";

export interface UploadedFile {
  url: string;
  pathname: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface UploadError {
  error: string;
  details?: string;
  allowedTypes?: string[];
}

async function readJsonOrThrow(response: Response): Promise<unknown> {
  const data = await response.json();
  if (!response.ok) {
    const payload = data as { error?: string };
    throw new Error(payload.error || "Request failed");
  }
  return data;
}

/**
 * Upload a file to Vercel Blob via our API
 * @param file - The file to upload
 * @returns Promise with uploaded file metadata
 */
export async function uploadFile(file: File): Promise<UploadedFile> {
  assertValidUploadFile(file);

  try {
    const response = await fetch(
      `/api/files/upload?filename=${encodeURIComponent(file.name)}`,
      {
        method: "POST",
        body: file,
      }
    );
    return (await readJsonOrThrow(response)) as UploadedFile;
  } catch (error) {
    console.error("File upload error:", error);
    throw error instanceof Error
      ? error
      : new Error("Failed to upload file");
  }
}

/**
 * Upload multiple files in parallel
 * @param files - Array of files to upload
 * @param onProgress - Optional callback for progress updates
 * @returns Promise with array of uploaded file metadata
 */
export async function uploadFiles(
  files: File[],
  onProgress?: (completed: number, total: number) => void
): Promise<UploadedFile[]> {
  let completed = 0;

  try {
    const results = await Promise.all(
      files.map(async (file) => {
        const result = await uploadFile(file);
        completed++;
        onProgress?.(completed, files.length);
        return result;
      }),
    );
    return results;
  } catch (error) {
    console.error("Failed to upload files:", error);
    throw error;
  }
}

/**
 * Delete a file from Vercel Blob via our API
 * @param pathname - The blob pathname to delete
 * @returns Promise that resolves when file is deleted
 */
export async function deleteFile(pathname: string): Promise<void> {
  try {
    const response = await fetch(
      `/api/files/delete?pathname=${encodeURIComponent(pathname)}`,
      {
        method: "DELETE",
      }
    );
    await readJsonOrThrow(response);
  } catch (error) {
    console.error("File deletion error:", error);
    throw error instanceof Error
      ? error
      : new Error("Failed to delete file");
  }
}

/**
 * Format file size for display
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "2.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Get file type emoji based on content type
 * @param contentType - MIME type of the file
 * @returns Emoji string
 */
export function getFileTypeEmoji(contentType: string): string {
  if (contentType.startsWith("image/")) return "🖼️";
  if (contentType.startsWith("video/")) return "🎥";
  if (contentType.startsWith("audio/")) return "🎵";
  if (contentType === "application/pdf") return "📄";
  return "📎";
}

export { validateFile };
