"use client";

import { CheckCircle2, MessageCircle, Send } from "lucide-react";
import { useId, useReducer } from "react";
import { Button } from "@/components/ui/button";
import { COMMENT_LIMITS } from "@/lib/comments";

interface Comment {
	_id: string;
	authorName: string;
	text: string;
	createdAt: string;
}

interface CommentsSectionProps {
	postId: string;
	initialComments: Comment[];
}

type PendingComment = Omit<Comment, "_id">;
type SubmitResult = { success: true } | { success: false; error: string };
type CommentFormState = {
	authorName: string;
	text: string;
	website: string;
	isSubmitting: boolean;
	error: string | null;
	pendingComment: PendingComment | null;
};
type CommentFormAction =
	| { type: "field"; field: "authorName" | "text" | "website"; value: string }
	| { type: "submit" }
	| { type: "error"; error: string }
	| { type: "success"; pendingComment: PendingComment };

const INITIAL_FORM_STATE: CommentFormState = {
	authorName: "",
	text: "",
	website: "",
	isSubmitting: false,
	error: null,
	pendingComment: null,
};

const commentDateFormatter = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

function formatCommentDate(dateString: string) {
	return commentDateFormatter.format(new Date(dateString));
}

function initialsOf(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

async function submitComment(input: {
	postId: string;
	authorName: string;
	text: string;
	website: string;
}): Promise<SubmitResult> {
	const response = await fetch("/api/blog/comments", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	}).catch(() => null);

	if (!response) {
		return { success: false, error: "We couldn't reach the comment service." };
	}
	if (!response.ok) {
		const result = (await response.json().catch(() => null)) as {
			error?: string;
		} | null;
		return {
			success: false,
			error: result?.error ?? "We couldn't submit your comment.",
		};
	}
	return { success: true };
}

function commentFormReducer(
	state: CommentFormState,
	action: CommentFormAction,
): CommentFormState {
	switch (action.type) {
		case "field":
			return { ...state, [action.field]: action.value };
		case "submit":
			return { ...state, isSubmitting: true, error: null };
		case "error":
			return { ...state, isSubmitting: false, error: action.error };
		case "success":
			return {
				...state,
				text: "",
				website: "",
				isSubmitting: false,
				error: null,
				pendingComment: action.pendingComment,
			};
	}
}

export function CommentsSection({
	postId,
	initialComments,
}: CommentsSectionProps) {
	const nameId = useId();
	const textId = useId();
	const [form, dispatch] = useReducer(commentFormReducer, INITIAL_FORM_STATE);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (form.isSubmitting) return;

		dispatch({ type: "submit" });
		const result = await submitComment({
			postId,
			authorName: form.authorName,
			text: form.text,
			website: form.website,
		});
		if (!result.success) {
			dispatch({ type: "error", error: result.error });
			return;
		}

		dispatch({
			type: "success",
			pendingComment: {
				authorName: form.authorName.trim(),
				text: form.text.trim(),
				createdAt: new Date().toISOString(),
			},
		});
	}

	return (
		<section
			className="mt-16 border-t border-border pt-12"
			aria-labelledby="comments-title"
		>
			<div className="max-w-2xl">
				<div className="flex items-center gap-3">
					<div className="grid size-10 place-items-center rounded-full bg-brand/10 text-brand">
						<MessageCircle className="size-5" aria-hidden="true" />
					</div>
					<div>
						<p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
							Join the conversation
						</p>
						<h2 id="comments-title" className="font-display text-2xl">
							Comments ({initialComments.length})
						</h2>
					</div>
				</div>
				<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
					No account required. Share your perspective using a display name;
					comments appear after a quick editorial review.
				</p>
			</div>

			<form
				onSubmit={handleSubmit}
				className="mt-8 max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
			>
				<div className="space-y-2">
					<label
						htmlFor={nameId}
						className="text-sm font-medium text-foreground"
					>
						Display name
					</label>
					<input
						id={nameId}
						value={form.authorName}
						onChange={(event) =>
							dispatch({
								type: "field",
								field: "authorName",
								value: event.target.value,
							})
						}
						autoComplete="nickname"
						minLength={COMMENT_LIMITS.authorNameMin}
						maxLength={COMMENT_LIMITS.authorNameMax}
						required
						disabled={form.isSubmitting}
						placeholder="How should we credit you?"
						className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition placeholder:text-muted-foreground focus:border-brand/50 focus:ring-2 focus:ring-brand/15 disabled:opacity-60"
					/>
				</div>

				<div className="mt-5 space-y-2">
					<div className="flex items-center justify-between gap-4">
						<label
							htmlFor={textId}
							className="text-sm font-medium text-foreground"
						>
							Comment
						</label>
						<span className="text-xs tabular-nums text-muted-foreground">
							{form.text.length}/{COMMENT_LIMITS.textMax.toLocaleString()}
						</span>
					</div>
					<textarea
						id={textId}
						value={form.text}
						onChange={(event) =>
							dispatch({
								type: "field",
								field: "text",
								value: event.target.value,
							})
						}
						minLength={COMMENT_LIMITS.textMin}
						maxLength={COMMENT_LIMITS.textMax}
						required
						disabled={form.isSubmitting}
						rows={5}
						placeholder="What stood out to you?"
						className="w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-brand/50 focus:ring-2 focus:ring-brand/15 disabled:opacity-60"
					/>
				</div>

				<div
					className="absolute -left-[10000px] top-auto size-px overflow-hidden"
					aria-hidden="true"
				>
					<label htmlFor={`${nameId}-website`}>Website</label>
					<input
						id={`${nameId}-website`}
						tabIndex={-1}
						autoComplete="off"
						value={form.website}
						onChange={(event) =>
							dispatch({
								type: "field",
								field: "website",
								value: event.target.value,
							})
						}
					/>
				</div>

				<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs leading-relaxed text-muted-foreground">
						Be constructive. Spam and abusive submissions are rejected.
					</p>
					<Button
						type="submit"
						disabled={
							form.isSubmitting ||
							form.authorName.trim().length < COMMENT_LIMITS.authorNameMin ||
							form.text.trim().length < COMMENT_LIMITS.textMin
						}
						className="self-start sm:self-auto"
					>
						<Send className="size-4" aria-hidden="true" />
						{form.isSubmitting ? "Submitting…" : "Submit for review"}
					</Button>
				</div>

				<div className="mt-4" aria-live="polite">
					{form.error ? (
						<p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
							{form.error}
						</p>
					) : null}
					{form.pendingComment ? (
						<div className="rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm">
							<p className="flex items-center gap-2 font-medium text-foreground">
								<CheckCircle2
									className="size-4 text-brand"
									aria-hidden="true"
								/>
								Thanks, {form.pendingComment.authorName}. Your comment is
								awaiting review.
							</p>
							<p className="mt-1 line-clamp-2 text-muted-foreground">
								{form.pendingComment.text}
							</p>
						</div>
					) : null}
				</div>
			</form>

			<div className="mt-10 space-y-5">
				{initialComments.length === 0 ? (
					<div className="max-w-2xl rounded-2xl border border-dashed border-border px-6 py-8 text-center">
						<p className="text-sm font-medium text-foreground">
							Start the discussion
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Be the first reader to share a thoughtful response.
						</p>
					</div>
				) : (
					initialComments.map((comment) => (
						<article
							key={comment._id}
							className="max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
						>
							<header className="flex items-center gap-3">
								<div className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-foreground">
									{initialsOf(comment.authorName)}
								</div>
								<div>
									<p className="text-sm font-medium text-foreground">
										{comment.authorName}
									</p>
									<time
										dateTime={comment.createdAt}
										className="text-xs text-muted-foreground"
									>
										{formatCommentDate(comment.createdAt)}
									</time>
								</div>
							</header>
							<p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
								{comment.text}
							</p>
						</article>
					))
				)}
			</div>
		</section>
	);
}
