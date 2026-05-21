"use client";

import { Progress } from "@repo/ui/components/ui/progress";

type ChatImportStatusBannerProps = {
  isBackgroundImporting: boolean;
  importFailureMessage: string | null;
  importProgress: { percent: number; stage: string } | null;
};

export function ChatImportStatusBanner({
  isBackgroundImporting,
  importFailureMessage,
  importProgress,
}: ChatImportStatusBannerProps) {
  if (!isBackgroundImporting && !importFailureMessage) {
    return null;
  }

  if (isBackgroundImporting) {
    return (
      <div className="mx-auto mt-3 w-full max-w-4xl rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">
            Import in progress
            {importProgress ? ` (${importProgress.percent}%)` : ""}
          </p>
          <p className="text-xs text-primary/80">
            {importProgress?.stage || "Preparing import"}
          </p>
        </div>
        <Progress
          value={importProgress?.percent ?? 8}
          className="mt-2 h-1.5 bg-primary/15"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto mt-3 w-full max-w-4xl rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      Import failed: {importFailureMessage}
    </div>
  );
}
