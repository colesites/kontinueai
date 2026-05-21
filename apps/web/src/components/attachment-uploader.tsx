"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@repo/convex/convex/_generated/api";
import { AttachmentEmptyState } from "./attachment-uploader/AttachmentEmptyState";
import { AttachmentFileList } from "./attachment-uploader/AttachmentFileList";
import { AttachmentUploadControl } from "./attachment-uploader/AttachmentUploadControl";
import type { AttachmentUploaderProps } from "./attachment-uploader/types";
import { useAttachmentUploader } from "./attachment-uploader/useAttachmentUploader";
import { useIsProPlan } from "../lib/use-plan-tier";
import { cn } from "@repo/ui/lib/utils";

export function AttachmentUploader({
  chatId,
  messageId,
  onFileUploaded,
  className,
}: AttachmentUploaderProps) {
  const canUpload = useIsProPlan();
  const files = useQuery(api.files.listByChat, { chatId });
  const { isUploading, uploadProgress, handleFileSelect, handleDeleteFile } =
    useAttachmentUploader({
      chatId,
      messageId,
      onFileUploaded,
      canUpload,
    });

  if (files === undefined) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <AttachmentUploadControl
        canUpload={canUpload}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        onFileSelect={handleFileSelect}
      />

      <AttachmentFileList files={files} onDeleteFile={handleDeleteFile} />

      {files.length === 0 && !isUploading && <AttachmentEmptyState />}
    </div>
  );
}
