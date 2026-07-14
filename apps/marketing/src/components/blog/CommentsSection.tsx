"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createComment } from "@/app/actions/comments";

interface Comment {
	_id: string;
	text: string;
	createdAt: string;
}

interface CommentsSectionProps {
	postId: string;
	initialComments: Comment[];
}

export function CommentsSection({ postId, initialComments }: CommentsSectionProps) {
	const [comments, setComments] = useState<Comment[]>(initialComments);
	const [newComment, setNewComment] = useState("");
	const [isPending, startTransition] = useTransition();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!newComment.trim() || isPending) return;

		const commentText = newComment.trim();
		setNewComment(""); // Optimistically clear input

		// Optimistic update
		const tempId = `temp-${Date.now()}`;
		const optimisticComment: Comment = {
			_id: tempId,
			text: commentText,
			createdAt: new Date().toISOString(),
		};
		setComments([optimisticComment, ...comments]);

		startTransition(async () => {
			const result = await createComment(postId, commentText);
			if (!result.success) {
				// Revert on failure
				setComments((prev) => prev.filter((c) => c._id !== tempId));
				setNewComment(commentText);
				alert("Failed to post comment. Please try again.");
			}
		});
	};

	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		return new Intl.DateTimeFormat("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		}).format(date);
	};

	return (
		<div className="mt-16 border-t border-border pt-12">
			<h3 className="font-display mb-8 text-2xl">
				Comments ({comments.length})
			</h3>

			{/* Comment Form */}
			<form onSubmit={handleSubmit} className="mb-12">
				<textarea
					value={newComment}
					onChange={(e) => setNewComment(e.target.value)}
					placeholder="Leave a comment..."
					className="focus-visible:ring-ring min-h-[100px] w-full resize-none rounded-xl border border-input bg-transparent px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={isPending}
				/>
				<div className="mt-3 flex justify-end">
					<Button
						type="submit"
						disabled={!newComment.trim() || isPending}
						className="hover-lift"
					>
						{isPending ? "Posting..." : "Post Comment"}
					</Button>
				</div>
			</form>

			{/* Comments List */}
			<div className="space-y-6">
				{comments.length === 0 ? (
					<p className="text-muted-foreground text-sm">No comments yet. Be the first to share your thoughts!</p>
				) : (
					comments.map((comment) => (
						<div key={comment._id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
							<p className="text-sm leading-relaxed text-foreground">
								{comment.text}
							</p>
							<p className="mt-3 text-xs text-muted-foreground">
								{formatDate(comment.createdAt)}
							</p>
						</div>
					))
				)}
			</div>
		</div>
	);
}
