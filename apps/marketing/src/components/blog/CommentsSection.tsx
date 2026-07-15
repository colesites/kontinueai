interface Comment {
	_id: string;
	text: string;
	createdAt: string;
}

interface CommentsSectionProps {
	initialComments: Comment[];
}

const commentDateFormatter = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

function formatCommentDate(dateString: string) {
	return commentDateFormatter.format(new Date(dateString));
}

export function CommentsSection({ initialComments }: CommentsSectionProps) {
	return (
		<div className="mt-16 border-t border-border pt-12">
			<h3 className="font-display mb-3 text-2xl">
				Published comments ({initialComments.length})
			</h3>
			<p className="mb-10 max-w-2xl text-sm leading-relaxed text-muted-foreground">
				Comments are published only after editorial review. Public anonymous
				submissions are disabled while Kontinue AI designs an authenticated
				discussion experience.
			</p>

			<div className="space-y-6">
				{initialComments.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No published comments yet.
					</p>
				) : (
					initialComments.map((comment) => (
						<div
							key={comment._id}
							className="rounded-xl border border-border bg-card p-5 shadow-sm"
						>
							<p className="text-sm leading-relaxed text-foreground">
								{comment.text}
							</p>
							<time
								dateTime={comment.createdAt}
								className="mt-3 block text-xs text-muted-foreground"
							>
								{formatCommentDate(comment.createdAt)}
							</time>
						</div>
					))
				)}
			</div>
		</div>
	);
}
