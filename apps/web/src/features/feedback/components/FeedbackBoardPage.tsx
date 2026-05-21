"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Flame, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { FeedbackComposer } from "./FeedbackComposer";
import { FeedbackPostCard } from "./FeedbackPostCard";
import { FeedbackPostModal } from "./FeedbackPostModal";
import { useFeedbackBoard } from "../hooks/useFeedbackBoard";
import { type FeedbackPost } from "../types";
import { cn } from "@repo/ui/lib/utils";

export function FeedbackBoardPage() {
  const router = useRouter();
  const {
    form,
    isLoading,
    topPosts,
    newPosts,
    updateForm,
    createPost,
    votePost,
    addComment,
    editPost,
    deletePost,
  } = useFeedbackBoard();
  const [activeTab, setActiveTab] = useState<"top" | "new">("top");
  const [selectedPost, setSelectedPost] = useState<FeedbackPost | null>(null);

  const activePosts = activeTab === "top" ? topPosts : newPosts;

  // Keep modal post data fresh when Convex updates the list
  const liveSelectedPost = selectedPost
    ? (newPosts.find((p) => p.id === selectedPost.id) ?? selectedPost)
    : null;

  const goBack = () => {
    router.push("/");
  };

  const publishPost = async () => {
    if (!form.title.trim() || !form.details.trim()) {
      toast.error("Add both title and details before publishing.");
      return;
    }

    const created = await createPost();
    if (!created) {
      toast.error("Could not publish post. Please sign in and try again.");
      return;
    }
    toast.success("Posted successfully.");
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-card/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground sm:text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Kontinue AI
          </button>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
            Feedback Beta
          </span>
        </div>

        <section className="rounded-3xl border border-border/70 bg-linear-to-br from-card via-card/90 to-background p-5 shadow-sm sm:p-7">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Feedback Board
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Post feature ideas, bug reports, or UI/UX feedback, vote on what
            matters most, and discuss with the community.
          </p>
        </section>

        <div className="mt-6 space-y-5">
          <FeedbackComposer
            title={form.title}
            details={form.details}
            type={form.type}
            onTitleChange={(value) => updateForm({ title: value })}
            onDetailsChange={(value) => updateForm({ details: value })}
            onTypeChange={(value) => updateForm({ type: value })}
            onSubmit={publishPost}
          />

          <section className="space-y-3">
            <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/50 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("top")}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  activeTab === "top"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Flame className="h-3.5 w-3.5" />
                Top
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("new")}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  activeTab === "new"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                New
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              {activeTab === "top"
                ? "Sorted by highest vote score."
                : "Sorted by most recent posts."}
            </p>

            {activePosts.map((post) => (
              <FeedbackPostCard
                key={`${activeTab}-${post.id}`}
                post={post}
                onVote={votePost}
                onOpenDetail={() => setSelectedPost(post)}
              />
            ))}

            {!isLoading && activePosts.length === 0 && (
              <p className="rounded-xl border border-dashed border-border/70 bg-card/50 px-4 py-3 text-xs text-muted-foreground">
                No feedback yet. Be the first to post.
              </p>
            )}
            {isLoading && (
              <p className="rounded-xl border border-dashed border-border/70 bg-card/50 px-4 py-3 text-xs text-muted-foreground">
                Loading posts...
              </p>
            )}
          </section>
        </div>
      </div>

      <FeedbackPostModal
        post={liveSelectedPost}
        open={liveSelectedPost !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPost(null);
        }}
        onVote={votePost}
        onComment={addComment}
        onEdit={editPost}
        onDelete={deletePost}
      />
    </main>
  );
}
