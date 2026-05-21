"use client";

import { Sparkles, Loader2 } from "lucide-react";
import { CreationCard, type CreationData } from "./CreationCard";
import { cn } from "@repo/ui/lib/utils";
import type { Id } from "@repo/convex/convex/_generated/dataModel";

interface CanvasGalleryProps {
  items?: CreationData[];
  tab: "community" | "mine";
  myLikes: Set<Id<"canvasCreations">>;
  publishingIds: Set<Id<"canvasCreations">>;
  onToggleLike: (id: Id<"canvasCreations">) => void;
  onExpand: (creation: CreationData) => void;
  onPublish: (id: Id<"canvasCreations">) => void;
  paginationStatus:
    | "CanLoadMore"
    | "LoadingMore"
    | "Exhausted"
    | "LoadingFirstPage";
  onLoadMore: () => void;
}

export function CanvasGallery({
  items,
  tab,
  myLikes,
  publishingIds,
  onToggleLike,
  onExpand,
  onPublish,
  paginationStatus,
  onLoadMore,
}: CanvasGalleryProps) {
  if (!items || paginationStatus === "LoadingFirstPage") {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-3 pt-4 sm:p-8">
        <div className="columns-1 md:columns-2 lg:columns-3 gap-1 pb-4 space-y-1">
          {[
            "aspect-video",
            "aspect-square",
            "aspect-[3/4]",
            "aspect-[4/3]",
            "aspect-[9/16]",
            "aspect-video",
          ].map((aspect, i) => (
            <div
              key={i}
              className={cn(
                "w-full bg-muted/10 border-2 border-dashed border-border/40 rounded-2xl flex items-center justify-center break-inside-avoid",
                aspect
              )}
            >
              <Sparkles className="h-8 w-8 text-muted-foreground/30" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <div className="columns-1 md:columns-2 lg:columns-3 gap-1 px-3 pb-4 space-y-1">
        {items.map((creation) => (
          <div
            key={creation._id}
            className="relative group overflow-hidden break-inside-avoid mb-1"
          >
            <CreationCard
              creation={creation}
              isLiked={myLikes.has(creation._id)}
              onToggleLike={onToggleLike}
              onExpand={onExpand}
            />

            {/* Admin controls for 'mine' tab */}
            {tab === "mine" && (
              <div className="absolute top-4 left-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  disabled={publishingIds?.has(creation._id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPublish(creation._id);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-xl border backdrop-blur-md transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                    creation.isPublished
                      ? "bg-green-500/20 text-green-400 border-green-500/30"
                      : "bg-background/20 text-foreground border-foreground/20"
                  )}
                >
                  {publishingIds?.has(creation._id) ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                      Processing...
                    </>
                  ) : creation.isPublished ? (
                    "Published"
                  ) : (
                    "Publish"
                  )}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Load More */}
      {paginationStatus === "CanLoadMore" && (
        <div className="flex justify-center py-8">
          <button
            type="button"
            onClick={onLoadMore}
            className="inline-flex items-center gap-2 rounded-full bg-secondary/40 px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-foreground/60 transition-all hover:bg-secondary hover:text-foreground hover:scale-105 active:scale-95"
          >
            Load More
          </button>
        </div>
      )}
      {paginationStatus === "LoadingMore" && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
