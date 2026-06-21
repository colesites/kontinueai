"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/ui/select";
import type { FeedbackPostType } from "../types";

type FeedbackComposerProps = {
	title: string;
	details: string;
	type: FeedbackPostType;
	onTitleChange: (value: string) => void;
	onDetailsChange: (value: string) => void;
	onTypeChange: (value: FeedbackPostType) => void;
	onSubmit: () => void | Promise<void>;
};

export function FeedbackComposer({
	title,
	details,
	type,
	onTitleChange,
	onDetailsChange,
	onTypeChange,
	onSubmit,
}: FeedbackComposerProps) {
	return (
		<section className="surface-card rounded-2xl p-4 sm:p-5">
			<h2 className="text-base font-semibold tracking-tight sm:text-lg">
				Create a post
			</h2>
			<p className="mt-1 text-xs text-muted-foreground sm:text-sm">
				Share feature requests and bugs so others can vote and discuss.
			</p>

			<div className="mt-4 space-y-3">
				<input
					value={title}
					onChange={(event) => onTitleChange(event.target.value)}
					placeholder="Post title"
					className="surface-inset h-10 w-full rounded-xl px-3 text-sm outline-none transition-all focus:bg-foreground/6 focus:ring-2 focus:ring-primary/30"
					maxLength={120}
				/>
				<textarea
					value={details}
					onChange={(event) => onDetailsChange(event.target.value)}
					placeholder="Describe your idea or bug in detail..."
					className="surface-inset min-h-28 w-full resize-y rounded-xl px-3 py-2 text-sm outline-none transition-all focus:bg-foreground/6 focus:ring-2 focus:ring-primary/30"
					maxLength={2000}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Select
						value={type}
						onValueChange={(value) => onTypeChange(value as FeedbackPostType)}
					>
						<SelectTrigger className="surface-inset h-10 min-w-[168px] rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-primary/30">
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="rounded-xl">
							<SelectItem value="feature">Feature Idea</SelectItem>
							<SelectItem value="bug">Bug Report</SelectItem>
							<SelectItem value="ui_ux">UI/UX</SelectItem>
						</SelectContent>
					</Select>
					<button
						type="button"
						onClick={() => void onSubmit()}
						className="glow-button ml-auto h-10 rounded-xl px-5 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]"
					>
						Publish
					</button>
				</div>
			</div>
		</section>
	);
}
