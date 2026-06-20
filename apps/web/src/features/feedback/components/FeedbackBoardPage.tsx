"use client";

import { cn } from "@repo/ui/lib/utils";
import { ArrowLeft, Flame, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useFeedbackBoard } from "../hooks/useFeedbackBoard";
import type { FeedbackPost } from "../types";
import { FeedbackComposer } from "./FeedbackComposer";
import { FeedbackPostCard } from "./FeedbackPostCard";
import { FeedbackPostModal } from "./FeedbackPostModal";

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
						className="surface-inset group inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-all duration-150 hover:bg-foreground/8 hover:text-foreground"
					>
						<ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
						Back to Kontinue AI
					</button>
					<span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/25">
						Feedback Beta
					</span>
				</div>

				<section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-card via-card/90 to-background p-6 ring-1 ring-foreground/8 sm:p-8">
					<div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
					<p className="eyebrow relative">Community</p>
					<h1 className="relative mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
						Feedback Board
					</h1>
					<p className="relative mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
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
						<div className="surface-inset flex items-center gap-1 rounded-xl p-1">
							<button
								type="button"
								onClick={() => setActiveTab("top")}
								className={cn(
									"inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
									activeTab === "top"
										? "bg-primary text-primary-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
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
										: "text-muted-foreground hover:text-foreground",
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
							<p className="rounded-xl border border-dashed border-foreground/15 px-4 py-3 text-xs text-muted-foreground">
								No feedback yet. Be the first to post.
							</p>
						)}
						{isLoading && (
							<p className="rounded-xl border border-dashed border-foreground/15 px-4 py-3 text-xs text-muted-foreground">
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
