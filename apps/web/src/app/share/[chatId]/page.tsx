"use client";

import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { ArrowRight, Loader2, MessageSquareOff } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChatMessage } from "../../../features/chat/components/ChatMessage";

export default function SharePage() {
	const params = useParams();
	const chatId = params.chatId as Id<"chats">;

	// Query Convex for shared conversation (no auth required)
	const conversation = useQuery(api.chats.getSharedConversation, { chatId });

	// Loading state
	if (conversation === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
			</div>
		);
	}

	// Error state - conversation not found (404)
	if (conversation === null) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
				<div className="flex size-12 items-center justify-center rounded-2xl bg-foreground/5 text-muted-foreground ring-1 ring-foreground/10">
					<MessageSquareOff size={20} />
				</div>
				<div>
					<h1 className="text-xl font-semibold text-foreground">
						Conversation Not Found
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						This conversation doesn&apos;t exist or has been deleted.
					</p>
				</div>
				<Link
					href="/"
					className="glow-button mt-1 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]"
				>
					Go to Kontinue AI
					<ArrowRight size={16} />
				</Link>
			</div>
		);
	}

	// Render conversation in read-only format
	const messages = conversation.messages || [];

	return (
		<div className="relative min-h-screen overflow-hidden bg-background">
			{/* Ambient brand glow */}
			<div className="pointer-events-none absolute left-1/2 top-0 z-0 h-[360px] w-[760px] max-w-[130vw] -translate-x-1/2 rounded-[100%] bg-primary/10 blur-[120px]" />

			<div className="relative z-10 mx-auto w-full max-w-4xl px-4 py-10">
				{/* Header */}
				<header className="mb-8">
					<Link
						href="/"
						className="inline-flex items-center"
						aria-label="Kontinue AI"
					>
						{/* biome-ignore lint/performance/noImgElement: tiny static brand mark on a public page; next/image fails in the happy-dom test env */}
						<img
							src="/kontinueai.svg"
							alt="Kontinue AI"
							width={120}
							height={24}
							className="h-5 w-auto invert dark:invert-0"
						/>
					</Link>
					<div className="surface-card mt-5 rounded-2xl p-5 sm:p-6">
						<p className="eyebrow">Shared conversation</p>
						<h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
							{conversation.title}
						</h1>
						<p className="mt-2 text-sm text-muted-foreground">
							{messages.length} message{messages.length === 1 ? "" : "s"} ·
							read-only
						</p>
					</div>
				</header>

				{/* Messages */}
				<div className="space-y-1">
					{messages.map((message) => (
						<ChatMessage
							key={message._id}
							role={message.role as "user" | "assistant"}
							content={message.content}
							imageParts={[]}
							isImported={false}
							isStreaming={false}
						/>
					))}
				</div>

				{/* Empty state */}
				{messages.length === 0 && (
					<div className="rounded-2xl border border-dashed border-foreground/15 px-4 py-12 text-center">
						<p className="text-sm text-muted-foreground">
							This conversation has no messages yet.
						</p>
					</div>
				)}

				{/* Conversion CTA */}
				<div className="surface-card relative mt-10 overflow-hidden rounded-2xl p-6 text-center sm:p-8">
					<div className="pointer-events-none absolute inset-x-0 -bottom-16 h-32 bg-primary/10 blur-3xl" />
					<p className="relative text-base font-semibold text-foreground sm:text-lg">
						Continue any AI conversation
					</p>
					<p className="relative mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
						Import shared chats from ChatGPT, Claude, or Gemini and keep going
						with full context.
					</p>
					<Link
						href="/"
						className="glow-button relative mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]"
					>
						Try Kontinue AI
						<ArrowRight size={16} />
					</Link>
				</div>
			</div>
		</div>
	);
}
