import { FaPaperclip } from "react-icons/fa";

export function AttachmentEmptyState() {
  return (
    <div className="rounded-lg border-2 border-dashed border-border px-4 py-8 text-center">
      <FaPaperclip className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        No attachments yet. Upload files to get started.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Allowed: PNG, JPEG, WebP, PDF (Max 5MB)
      </p>
    </div>
  );
}
