"use client";

import { cn } from "@repo/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import type { ChatMessageProps } from "../types";
import { ChatMessageActions } from "./ChatMessageActions";
import { ChatMessageImages } from "./ChatMessageImages";
import { ClockWidget } from "./ClockWidget";
import { EmailComposer } from "./EmailComposer";
import { MessageContent } from "./MessageContent";

const EMPTY_IMAGE_PARTS: string[] = [];

export function ChatMessage({
	role,
	content,
	imageParts = EMPTY_IMAGE_PARTS,
	clockData,
	emailDraft,
	isImported,
	isStreaming,
	onRetry,
	onEdit,
	onSwitchModel,
	modelOptionsByProvider,
	currentModelId,
}: ChatMessageProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(content);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	const isUser = role === "user";
	const isImageOnly = !content.trim() && imageParts.length > 0;

	const startEdit = () => {
		setDraft(content);
		setIsEditing(true);
	};
	const cancelEdit = () => setIsEditing(false);
	const saveEdit = () => {
		const next = draft.trim();
		if (!next || next === content.trim()) {
			setIsEditing(false);
			return;
		}
		onEdit?.(next);
		setIsEditing(false);
	};

	useEffect(() => {
		if (!isEditing) return;
		const el = textareaRef.current;
		if (!el) return;
		el.focus();
		el.setSelectionRange(el.value.length, el.value.length);
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, [isEditing]);

	if (role === "system") return null;

	return (
		<div
			className={cn("py-3", isUser ? "flex justify-end" : "flex justify-start")}
		>
			<div
				className={cn(
					"group max-w-[92%] sm:max-w-[85%]",
					isUser ? "ml-auto w-fit" : "w-fit",
				)}
			>
				{/* Bubble */}
				<div
					className={cn(
						"rounded-[22px] transition-shadow",
						isImageOnly ? "px-3 py-3" : "px-4 py-3",
						isUser
							? cn(
									// User bubble — primary gradient pill with a soft accent bloom
									"bg-linear-to-br from-primary/15 to-primary/7 ring-1 ring-primary/25",
									"shadow-[inset_0_1px_0_color-mix(in_oklch,white_16%,transparent),0_4px_16px_-8px_color-mix(in_oklch,var(--primary)_35%,transparent)]",
								)
							: cn(
									// Assistant bubble — frosted card with a hairline
									"bg-card/60 ring-1 ring-foreground/8 backdrop-blur-sm",
									"shadow-[0_1px_2px_-1px_color-mix(in_oklch,black_15%,transparent)]",
								),
						isEditing && "w-full min-w-[280px] sm:min-w-[420px]",
					)}
				>
					{isEditing && onEdit ? (
						<div className="flex flex-col gap-2">
							<textarea
								ref={textareaRef}
								value={draft}
								onChange={(e) => {
									setDraft(e.target.value);
									const el = e.currentTarget;
									el.style.height = "auto";
									el.style.height = `${el.scrollHeight}px`;
								}}
								onKeyDown={(e) => {
									if (e.key === "Escape") {
										e.preventDefault();
										cancelEdit();
									} else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
										e.preventDefault();
										saveEdit();
									}
								}}
								rows={1}
								className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
								placeholder="Edit your message…"
							/>
							<div className="flex items-center justify-end gap-2 pt-1">
								<span className="mr-auto text-[10.5px] text-muted-foreground/60 font-mono">
									⌘↵ to save · esc to cancel
								</span>
								<button
									type="button"
									onClick={cancelEdit}
									className="rounded-full px-3 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={saveEdit}
									disabled={!draft.trim() || draft.trim() === content.trim()}
									className={cn(
										"inline-flex items-center justify-center rounded-full px-3 py-1 text-[12px] font-semibold transition-all duration-200",
										"bg-primary text-primary-foreground shadow-[0_2px_8px_-2px_color-mix(in_oklch,var(--primary)_50%,transparent)]",
										"hover:scale-[1.04] hover:bg-primary/95",
										"active:scale-[0.96]",
										"disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed",
									)}
								>
									Save & regenerate
								</button>
							</div>
						</div>
					) : (
						<div
							className={cn(
								"prose max-w-none wrap-break-word dark:prose-invert",
								"prose-p:leading-relaxed prose-p:mt-0 prose-p:mb-4 last:prose-p:mb-0",
								"prose-headings:font-semibold prose-headings:mt-6 prose-headings:mb-3",
								"prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg",
								"prose-ul:my-3 prose-ul:list-disc prose-ul:pl-6",
								"prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-6",
								"prose-li:my-1",
								"prose-p:wrap-break-word prose-li:break-word prose-a:break-all",
								"prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-3",
								"prose-hr:my-4 prose-hr:border-foreground/10",
								"prose-strong:font-bold prose-strong:text-foreground",
								"prose-em:italic",
								"prose-code:text-sm prose-code:bg-foreground/5 prose-code:px-1 prose-code:rounded prose-code:font-medium",
							)}
						>
							{content ? (
								<MessageContent content={content} isStreaming={isStreaming} />
							) : !isUser &&
								!isStreaming &&
								imageParts.length === 0 &&
								!clockData &&
								!emailDraft ? (
								<p className="italic text-muted-foreground">
									No response was returned. Please retry or switch models.
								</p>
							) : null}
							<ChatMessageImages imageParts={imageParts} />
							{!isUser && clockData && (
								<ClockWidget timezone={clockData.timezone} />
							)}
							{!isUser && emailDraft && <EmailComposer draft={emailDraft} />}
						</div>
					)}
				</div>

				{/* Actions under the bubble — hidden while editing */}
				{!isStreaming && !isEditing && (
					<ChatMessageActions
						content={content}
						isUser={isUser}
						onRetry={onRetry}
						onEdit={onEdit ? startEdit : undefined}
						onSwitchModel={onSwitchModel}
						modelOptionsByProvider={modelOptionsByProvider}
						currentModelId={currentModelId}
						isImported={isImported}
					/>
				)}
			</div>
		</div>
	);
}
