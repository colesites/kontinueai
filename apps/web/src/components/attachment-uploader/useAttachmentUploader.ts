import { useCallback, useState, type ChangeEvent } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { deleteFile, uploadFile, validateFile } from "@repo/core/file-upload";
import type {
  AttachmentUploadProgress,
  AttachmentUploaderProps,
} from "./types";

type UseAttachmentUploaderOptions = Pick<
  AttachmentUploaderProps,
  "chatId" | "messageId" | "onFileUploaded"
> & {
  canUpload: boolean;
};

export function useAttachmentUploader(options: UseAttachmentUploaderOptions) {
  const { chatId, messageId, onFileUploaded, canUpload } = options;
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<AttachmentUploadProgress | null>(null);

  const createFileRecord = useMutation(api.files.createFileRecord);
  const deleteFileRecord = useMutation(api.files.deleteFileRecord);

  const handleFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      if (!canUpload) {
        toast.error("File uploads are available on Starter/Pro plans.");
        event.target.value = "";
        return;
      }

      const selectedFiles = event.target.files;
      if (!selectedFiles || selectedFiles.length === 0) return;

      const filesToUpload = Array.from(selectedFiles);
      for (const file of filesToUpload) {
        const error = validateFile(file);
        if (error) {
          toast.error(`${file.name}: ${error}`);
          event.target.value = "";
          return;
        }
      }

      setIsUploading(true);
      setUploadProgress({ current: 0, total: filesToUpload.length });

      try {
        for (let index = 0; index < filesToUpload.length; index += 1) {
          const file = filesToUpload[index];
          if (!file) continue;
          const uploadedFile = await uploadFile(file);

          const fileId = await createFileRecord({
            chatId,
            messageId,
            blobUrl: uploadedFile.url,
            pathname: uploadedFile.pathname,
            filename: uploadedFile.filename,
            contentType: uploadedFile.contentType,
            size: uploadedFile.size,
            fileType: "attachment",
          });

          setUploadProgress({ current: index + 1, total: filesToUpload.length });
          onFileUploaded?.(fileId);
        }

        toast.success(
          `Successfully uploaded ${filesToUpload.length} file${filesToUpload.length > 1 ? "s" : ""}`,
        );
      } catch (error) {
        console.error("Upload error:", error);
        toast.error(error instanceof Error ? error.message : "Failed to upload file");
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
        event.target.value = "";
      }
    },
    [canUpload, chatId, createFileRecord, messageId, onFileUploaded],
  );

  const handleDeleteFile = useCallback(
    async (fileId: Id<"files">, pathname: string) => {
      try {
        await deleteFile(pathname);
        await deleteFileRecord({ fileId });
        toast.success("File deleted successfully");
      } catch (error) {
        console.error("Delete error:", error);
        toast.error(error instanceof Error ? error.message : "Failed to delete file");
      }
    },
    [deleteFileRecord],
  );

  return {
    isUploading,
    uploadProgress,
    handleFileSelect,
    handleDeleteFile,
  };
}
