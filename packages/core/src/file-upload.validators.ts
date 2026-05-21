import {
  FILE_UPLOAD_ALLOWED_TYPES,
  INVALID_FILE_TYPE_MESSAGE,
  MAX_UPLOAD_SIZE_BYTES,
} from "./file-upload.constants";

function isAllowedUploadMimeType(contentType: string): boolean {
  if (contentType.startsWith("text/")) return true;
  return FILE_UPLOAD_ALLOWED_TYPES.includes(
    contentType as (typeof FILE_UPLOAD_ALLOWED_TYPES)[number],
  );
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "File size exceeds 5MB limit";
  }

  if (!isAllowedUploadMimeType(file.type)) {
    return INVALID_FILE_TYPE_MESSAGE;
  }

  return null;
}

export function assertValidUploadFile(file: File): void {
  const validationError = validateFile(file);
  if (validationError) {
    throw new Error(validationError);
  }
}
