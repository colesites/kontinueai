import type { ReactNode } from "react";
import type {
	GeneratedFile,
	MessageAttachment,
} from "../lib/message-transformer";

interface ChatInputProps {
	onSend: (message: string, files?: File[]) => void;
	isLoading?: boolean;
	disabled?: boolean;
	onStop?: () => void;
	model: string;
	onModelChange: (modelId: string) => void;
	webSearchEnabled?: boolean;
	onWebSearchToggle?: () => void;
	imageAspectRatio?: string;
	imageSize?: string | null;
	onImageAspectRatioChange?: (value: string) => void;
	onImageSizeChange?: (value: string | null) => void;
	agentId?: string | null;
	onAgentChange?: (value: string | null) => void;
	placeholder?: string;
	showModelSelector?: boolean;
	footerAccessory?: ReactNode;
}

interface ChatMessageProps {
	role: "user" | "assistant" | "system";
	content: string;
	reasoningText?: string;
	/** Images the assistant generated (data URLs or saved http(s) URLs) */
	imageParts?: string[];
	/** Files the user attached to their own message */
	attachments?: MessageAttachment[];
	/** Time-tool result; when present, the message renders a clock widget */
	clockData?: { timezone: string | null } | null;
	/** compose_email result; when present, the message renders an email composer */
	emailDraft?: {
		to: string;
		cc: string;
		subject: string;
		body: string;
	} | null;
	/** Files the run_code sandbox produced; rendered as download cards */
	generatedFiles?: GeneratedFile[];
	isImported?: boolean;
	isStreaming?: boolean;
	onRetry?: () => void;
	/** Provided for user messages — saves an edited prompt and re-generates */
	onEdit?: (newContent: string) => void;
	onSwitchModel?: (modelId: string) => void;
	modelOptionsByProvider?: Record<
		string,
		Array<{
			id: string;
			name: string;
			provider: string;
			disabled?: boolean;
		}>
	>;
	currentModelId?: string;
	reasoningEnabled?: boolean;
	turnStartTime?: number | null;
}

interface ImportedContextProps {
	provider: string;
	sourceUrl?: string;
	importedAt: number;
	messageCount: number;
}

export type { ChatInputProps, ChatMessageProps, ImportedContextProps };
