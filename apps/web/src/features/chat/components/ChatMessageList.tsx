"use client";

import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { Loader2 } from "lucide-react";
import type { DisplayMessage } from "../hooks/useChatMessageTransformer";
import { getChatTurnAnchorId } from "../lib/chat-turns";
import { ChatMessage } from "./ChatMessage";
import { ChatTurnNavigator } from "./ChatTurnNavigator";
import { ImageGenerationLoader } from "./ImageGenerationLoader";

interface ModelOption {
	id: string;
	name: string;
	provider: string;
	disabled?: boolean;
}

type ChatMessageListProps = {
	messages: DisplayMessage[];
	status: string;
	isStreaming: boolean;
	isGeneratingImage: boolean;
	currentModelId: string;
	modelOptionsWithAccess: Record<string, ModelOption[]> | undefined;
	onRetry: (id: string) => void;
	onEdit: (id: string, newContent: string) => void;
	onSwitchModel: (id: string, modelId: string) => void;
	showScrollToTopButton: boolean;
	showScrollToBottomButton: boolean;
	onScrollToTop: () => void;
	onScrollToBottom: () => void;
	messagesEndRef: React.RefObject<HTMLDivElement | null>;
};

function toTurnPreview(content: string, fallbackIndex: number): string {
	const oneLine = content.replace(/\s+/g, " ").trim();
	if (!oneLine) {
		return `Prompt ${fallbackIndex}`;
	}
	return oneLine.length > 46 ? `${oneLine.slice(0, 46).trimEnd()}...` : oneLine;
}

export function ChatMessageList({
	messages,
	status,
	isStreaming,
	isGeneratingImage,
	currentModelId,
	modelOptionsWithAccess,
	onRetry,
	onEdit,
	onSwitchModel,
	showScrollToTopButton,
	showScrollToBottomButton,
	onScrollToTop,
	onScrollToBottom,
	messagesEndRef,
}: ChatMessageListProps) {
	const { getCapabilities } = useModelCapabilities();
	const isThinkingModel = getCapabilities(currentModelId).includes("thinking");

	const turns = messages
		.filter((message) => message.role === "user")
		.map((message, index) => {
			return {
				id: message.id,
				preview: toTurnPreview(message.content, index + 1),
			};
		});

	return (
		<>
			<ChatTurnNavigator
				turns={turns}
				showScrollToTopButton={showScrollToTopButton}
				showScrollToBottomButton={showScrollToBottomButton}
				onScrollToTop={onScrollToTop}
				onScrollToBottom={onScrollToBottom}
			/>
			<div className="mx-auto w-full max-w-4xl px-3 pb-[150px] sm:px-4 lg:px-3">
				{messages.map((message, index) => (
					<div
						key={message.id}
						id={
							message.role === "user"
								? getChatTurnAnchorId(message.id)
								: undefined
						}
					>
						<ChatMessage
							role={message.role}
							content={message.content}
							imageParts={message.imageParts}
							clockData={message.clockData}
							emailDraft={message.emailDraft}
							isImported={message.isImported}
							isStreaming={
								isStreaming &&
								index === messages.length - 1 &&
								message.role === "assistant"
							}
							onRetry={
								message.role === "assistant"
									? () => onRetry(message.id)
									: undefined
							}
							onEdit={
								message.role === "user"
									? (newContent) => onEdit(message.id, newContent)
									: undefined
							}
							onSwitchModel={
								message.role === "assistant"
									? (modelId) => onSwitchModel(message.id, modelId)
									: undefined
							}
							modelOptionsByProvider={
								message.role === "assistant"
									? modelOptionsWithAccess
									: undefined
							}
							currentModelId={currentModelId}
						/>
					</div>
				))}

				{status === "submitted" &&
					(isGeneratingImage ? (
						<ImageGenerationLoader />
					) : (
						<div className="flex items-center gap-3.5 px-4 py-6 animate-fade-in-up">
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20 shadow-[0_4px_18px_-6px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
								<Loader2 size={16} className="animate-spin" />
							</div>
							<div className="flex items-center gap-2">
								<span className="text-sm font-medium text-muted-foreground">
									{isThinkingModel ? "Thinking" : "Generating"}
								</span>
								<span className="flex items-center gap-1">
									<span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/70" />
									<span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/70" />
									<span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/70" />
								</span>
							</div>
						</div>
					))}

				<div ref={messagesEndRef} />
			</div>
		</>
	);
}
