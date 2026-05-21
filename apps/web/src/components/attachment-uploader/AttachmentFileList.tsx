import { FaPaperclip } from "react-icons/fa";
import { Trash2 } from "lucide-react";
import { formatFileSize, getFileTypeEmoji } from "@repo/core/file-upload";
import type { AttachmentFile } from "./types";

type AttachmentFileListProps = {
  files: AttachmentFile[];
  onDeleteFile: (fileId: AttachmentFile["_id"], pathname: string) => Promise<void>;
};

export function AttachmentFileList({ files, onDeleteFile }: AttachmentFileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">Attachments ({files.length})</h3>

      <div className="space-y-2">
        {files.map((file) => (
          <div
            key={file._id}
            className="group flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50"
          >
            <span className="shrink-0 text-2xl">{getFileTypeEmoji(file.contentType)}</span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{file.filename}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.size)} • {file.contentType.split("/")[1]?.toUpperCase() ?? ""}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <a
                href={file.blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                title="View file"
              >
                <FaPaperclip className="h-3.5 w-3.5" />
              </a>

              <button
                type="button"
                onClick={() => onDeleteFile(file._id, file.pathname)}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Delete file"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
