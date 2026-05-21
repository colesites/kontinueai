"use client";

import {
  ArrowDown,
  ArrowUp,
  Bug,
  Lightbulb,
  MessageSquareText,
  Palette,
} from "lucide-react";
import { type FeedbackPost } from "../types";

type FeedbackPostCardProps = {
  post: FeedbackPost;
  onVote: (
    postId: FeedbackPost["id"],
    direction: "up" | "down",
  ) => Promise<void>;
  onOpenDetail: () => void;
};

function formatRelativeTime(createdAt: number): string {
  const elapsedMs = Date.now() - createdAt;
  if (elapsedMs < 60_000) return "just now";
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}

export function FeedbackPostCard({
  post,
  onVote,
  onOpenDetail,
}: FeedbackPostCardProps) {
  return (
    <article
      className="cursor-pointer rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm transition-colors hover:border-border hover:bg-card/90"
      onClick={onOpenDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetail();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {post.type === "feature" ? (
              <Lightbulb className="h-3.5 w-3.5" />
            ) : post.type === "bug" ? (
              <Bug className="h-3.5 w-3.5" />
            ) : (
              <Palette className="h-3.5 w-3.5" />
            )}
            {post.type === "ui_ux" ? "UI/UX" : post.type}
          </p>
          <h3 className="mt-1 text-sm font-semibold sm:text-base">
            {post.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground sm:text-sm">
            {post.details}
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {formatRelativeTime(post.createdAt)}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onVote(post.id, "up");
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/70 transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="Upvote"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-8 text-center text-sm font-semibold">
          {post.score}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onVote(post.id, "down");
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Downvote"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <MessageSquareText className="h-3.5 w-3.5" />
          {post.comments.length}
        </span>
      </div>
    </article>
  );
}
