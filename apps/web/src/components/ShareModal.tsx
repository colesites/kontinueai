"use client";

import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { useState } from "react";
import { LuCheck, LuCopy, LuShare2 } from "react-icons/lu";

interface ShareModalProps {
	isOpen: boolean;
	onClose: () => void;
	chatId: string;
	chatTitle: string;
}

export function ShareModal({
	isOpen,
	onClose,
	chatId,
	chatTitle,
}: ShareModalProps) {
	const [copySuccess, setCopySuccess] = useState(false);
	const [copyError, setCopyError] = useState(false);
	const shareUrl =
		typeof window !== "undefined"
			? `${window.location.origin}/share/${chatId}`
			: "";

	// Trim the chat title and use fallback if empty
	const displayTitle = chatTitle.trim() || "Conversation";

	const handleCopyLink = async () => {
		try {
			// Check if clipboard API is available
			if (!navigator.clipboard) {
				// Fallback: select the input text
				const input = document.querySelector(
					'[data-testid="share-link-input"]',
				) as HTMLInputElement;
				if (input) {
					input.select();
					setCopyError(true);
					setTimeout(() => setCopyError(false), 3000);
				}
				return;
			}

			await navigator.clipboard.writeText(shareUrl);
			setCopySuccess(true);
			setTimeout(() => setCopySuccess(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
			// Fallback: select the input text
			const input = document.querySelector(
				'[data-testid="share-link-input"]',
			) as HTMLInputElement;
			if (input) {
				input.select();
				setCopyError(true);
				setTimeout(() => setCopyError(false), 3000);
			}
		}
	};

	const handleSocialShare = async () => {
		if (navigator.share) {
			try {
				await navigator.share({
					title: displayTitle,
					url: shareUrl,
				});
			} catch (err) {
				// Ignore AbortError - user dismissed the share sheet (normal behavior)
				if (err instanceof Error && err.name === "AbortError") {
					return;
				}
				// Log real share failures
				console.error("Share failed:", err);
			}
		}
	};

	const canShare = typeof navigator !== "undefined" && navigator.share;

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="glass-strong rounded-2xl border-foreground/10 sm:max-w-md">
				<DialogHeader>
					<span className="eyebrow">Share</span>
					<DialogTitle className="text-xl font-semibold tracking-tight">
						Share {displayTitle}
					</DialogTitle>
					<p className="text-sm text-muted-foreground">
						Anyone with this link can view this conversation.
					</p>
				</DialogHeader>

				<div className="space-y-4">
					<div className="flex gap-2">
						<Input
							value={shareUrl}
							readOnly
							className="surface-inset flex-1 font-mono text-xs"
							data-testid="share-link-input"
						/>
						<Button
							onClick={handleCopyLink}
							className="glow-button shrink-0 text-primary-foreground"
							data-testid="copy-link-button"
						>
							{copySuccess ? (
								<>
									<LuCheck className="h-4 w-4 mr-2" />
									Copied!
								</>
							) : (
								<>
									<LuCopy className="h-4 w-4 mr-2" />
									Copy Link
								</>
							)}
						</Button>
					</div>

					{copyError && (
						<p
							className="text-sm text-muted-foreground"
							data-testid="copy-error-message"
						>
							Please manually copy the link above
						</p>
					)}

					{canShare && (
						<Button
							onClick={handleSocialShare}
							variant="outline"
							className="w-full"
							data-testid="social-share-button"
						>
							<LuShare2 className="h-4 w-4 mr-2" />
							Share via...
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
