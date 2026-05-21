import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { validateFile } from "@repo/core/file-upload";

export function useFileAttachments({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!enabled) {
        toast.error("File uploads are available on Starter/Pro plans.");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const validFiles: File[] = [];
      let rejectedCount = 0;
      for (const file of files) {
        const error = validateFile(file);
        if (error) {
          rejectedCount += 1;
          toast.error(`${file.name}: ${error}`);
          continue;
        }
        validFiles.push(file);
      }

      if (validFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...validFiles]);
      }
      if (rejectedCount > 0 && validFiles.length === 0) {
        toast.error("No files were attached.");
      }

      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [enabled],
  );

  const handleAttachClick = useCallback(() => {
    if (!enabled) {
      toast.error("File uploads are available on Starter/Pro plans.");
      return;
    }
    fileInputRef.current?.click();
  }, [enabled]);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setAttachedFiles([]);
  }, []);

  return {
    attachedFiles,
    fileInputRef,
    handleFileSelect,
    handleAttachClick,
    removeFile,
    clearFiles,
  };
}
