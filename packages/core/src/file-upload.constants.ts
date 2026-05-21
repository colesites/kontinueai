export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

export const FILE_UPLOAD_ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/json",
  "application/xml",
  "text/xml",
  "application/x-yaml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
] as const;

export const INVALID_FILE_TYPE_MESSAGE =
  "Invalid file type. Allowed: images, PDF, MP4, WebM, MOV, MP3, M4A, AAC, WAV, OGG, FLAC, and text files";
