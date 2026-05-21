import type { ChangeEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import type { AttachmentUploadProgress } from "./types";

type AttachmentUploadControlProps = {
  canUpload: boolean;
  isUploading: boolean;
  uploadProgress: AttachmentUploadProgress | null;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
};

export function AttachmentUploadControl({
  canUpload,
  isUploading,
  uploadProgress,
  onFileSelect,
}: AttachmentUploadControlProps) {
  const isDisabled = isUploading || !canUpload;

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="file-upload"
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2",
          "cursor-pointer bg-background text-sm font-medium text-foreground transition-colors hover:bg-muted",
          isDisabled && "cursor-not-allowed opacity-50",
        )}
        title={
          canUpload
            ? "Upload files"
            : "File uploads are available on Starter/Pro plans"
        }
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload Files
          </>
        )}
      </label>

      <input
        id="file-upload"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,application/pdf"
        onChange={onFileSelect}
        disabled={isDisabled}
        className="hidden"
      />

      {uploadProgress && (
        <span className="text-sm text-muted-foreground">
          {uploadProgress.current} / {uploadProgress.total}
        </span>
      )}
    </div>
  );
}
