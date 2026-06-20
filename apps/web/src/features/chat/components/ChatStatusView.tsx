"use client";

import type { Doc } from "@repo/convex/convex/_generated/dataModel";
import { ArrowLeft, Loader2, MessageCircleOff } from "lucide-react";
import Link from "next/link";

interface ChatStatusViewProps {
	chat: Doc<"chats"> | null | undefined;
	dbMessages: Doc<"messages">[] | undefined;
}

export function ChatStatusView({ chat, dbMessages }: ChatStatusViewProps) {
	if (chat === undefined || dbMessages === undefined) {
		return (
			<div className="absolute inset-0 flex items-center justify-center bg-background">
				<Loader2 className="w-6 h-6 text-primary animate-spin" />
			</div>
		);
	}

	if (chat === null) {
		return (
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
				<div className="flex size-12 items-center justify-center rounded-2xl bg-foreground/5 ring-1 ring-foreground/10 text-muted-foreground">
					<MessageCircleOff size={20} />
				</div>
				<div>
					<p className="text-base font-medium text-foreground">
						Chat not found
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						This conversation may have been deleted or moved.
					</p>
				</div>
				<Link
					href="/"
					className="glow-button mt-1 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]"
				>
					<ArrowLeft size={16} />
					Back to home
				</Link>
			</div>
		);
	}

	return null;
}
