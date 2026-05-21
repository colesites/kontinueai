import type { Doc, Id } from "@repo/convex/convex/_generated/dataModel";

export type AttachmentUploaderProps = {
  chatId: Id<"chats">;
  messageId?: Id<"messages">;
  onFileUploaded?: (fileId: Id<"files">) => void;
  className?: string;
};

export type AttachmentUploadProgress = {
  current: number;
  total: number;
};

export type AttachmentFile = Doc<"files">;
