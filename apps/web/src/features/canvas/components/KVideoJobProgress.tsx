"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";

// Sora-style progress loader for a long-form K-Video render job. Polls the
// Convex job row (live query) and shows stage + progress until it completes or
// fails. On completion the finished clip is already inserted into the gallery.
export function KVideoJobProgress({
  jobId,
  onClose,
}: {
  jobId: Id<"videoJobs">;
  onClose: () => void;
}) {
  const job = useQuery(api.videoJobs.getVideoJob, { jobId });

  useEffect(() => {
    if (!job) return;
    if (job.status === "completed") {
      toast.success("K-Video is ready — added to your creations.");
      const t = setTimeout(onClose, 1500);
      return () => clearTimeout(t);
    }
    if (job.status === "failed") {
      toast.error(job.error || "Video generation failed.");
      onClose();
    }
  }, [job, onClose]);

  if (!job || job.status === "completed" || job.status === "failed") {
    // Still render a brief "done" state on completed for the 1.5s before close.
    if (job?.status === "completed") {
      return (
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-2xl border border-border/40 bg-background/90 px-5 py-3 text-sm font-medium shadow-2xl backdrop-blur-xl">
            ✓ K-Video ready
          </div>
        </div>
      );
    }
    return null;
  }

  const progress = Math.max(2, Math.min(100, job.progress || 0));

  return (
    <div className="fixed bottom-28 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2">
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-background/90 p-4 shadow-2xl backdrop-blur-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide"
          className="absolute right-3 top-3 text-foreground/40 transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Generating K-Video…</p>
            <p className="truncate text-xs text-muted-foreground">
              {job.stage ?? "Starting"}
            </p>
          </div>
          <span className="text-xs font-bold tabular-nums text-foreground/60">
            {progress}%
          </span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          You can keep working — it'll appear in your creations when ready.
        </p>
      </div>
    </div>
  );
}
