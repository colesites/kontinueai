import type { UIMessage } from "ai";
import { useMemo } from "react";
import {
	buildSearchFallbackContent,
	type ClockData,
	collectClockDataFromParts,
	collectEmailDraftFromParts,
	collectGeneratedFilesFromParts,
	collectImageUrlsFromParts,
	collectPerplexitySearchResults,
	type EmailDraft,
	type GeneratedFile,
	mapImportedFlags,
	mapStoredGeneratedImages,
	mergeImportedChunks,
} from "../lib/message-transformer";

export type DisplayMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	reasoningText?: string;
	imageParts: string[];
	isImported: boolean;
	clockData?: ClockData | null;
	emailDraft?: EmailDraft | null;
	generatedFiles?: GeneratedFile[];
};

interface ConvexMessage {
	_id: string;
	role: "user" | "assistant" | "system";
	content: string;
	metadata?: { isImported?: boolean };
}

interface ConvexFile {
	fileType: string;
	messageId?: string;
	blobUrl: string;
}

function mapAiMessageToDisplayMessage(params: {
	msg: UIMessage;
	importedById: Record<string, boolean>;
	persistedImageUrlsByMessageId: Record<string, string[]>;
	storedGeneratedImageUrlsByMessageId: Record<string, string[]>;
}): DisplayMessage {
	const {
		msg,
		importedById,
		persistedImageUrlsByMessageId,
		storedGeneratedImageUrlsByMessageId,
	} = params;

	const textParts = msg.parts.filter(
		(part): part is { type: "text"; text: string } => part.type === "text",
	);
	let content = textParts.map((part) => part.text).join("");

	// Extract native AI SDK reasoning parts (type: "reasoning")
	const reasoningParts = msg.parts.filter(
		(part) => part.type === "reasoning",
	) as Array<{ type: "reasoning"; text?: string; reasoning?: string }>;
	let reasoningText = reasoningParts
		.map((part) => part.text ?? part.reasoning ?? "")
		.join("");

	// Extract <think>...</think> tags if present in content (common with OpenRouter / open models)
	if (/<think/i.test(content)) {
		const thinkMatch = content.match(/<\s*think\s*>([\s\S]*?)(?:<\/\s*think\s*>|$)/i);
		if (thinkMatch) {
			const extracted = thinkMatch[1].trim();
			if (extracted) {
				reasoningText = reasoningText
					? `${reasoningText}\n\n${extracted}`
					: extracted;
			}
			content = content.replace(/<\s*think\s*>[\s\S]*?<\/\s*think\s*>/gi, "").trim();
			if (/^<\s*think/i.test(content)) {
				content = "";
			}
		}
	}

	const searchResults = collectPerplexitySearchResults(msg.parts);
	if (!content.trim() && searchResults.length > 0) {
		content = buildSearchFallbackContent(searchResults);
	}

	const imageParts = collectImageUrlsFromParts(msg.parts);

	const persisted = persistedImageUrlsByMessageId[msg.id] ?? [];
	const stored = storedGeneratedImageUrlsByMessageId[msg.id] ?? [];
	const resolvedImages = [...new Set([...persisted, ...stored, ...imageParts])];

	const clockData = collectClockDataFromParts(msg.parts);
	const emailDraft = collectEmailDraftFromParts(msg.parts);
	const generatedFiles = collectGeneratedFilesFromParts(msg.parts);

	return {
		id: msg.id,
		role: msg.role as "user" | "assistant",
		content,
		reasoningText: reasoningText.trim() ? reasoningText.trim() : undefined,
		imageParts: resolvedImages,
		isImported: importedById[msg.id] ?? false,
		clockData,
		emailDraft,
		generatedFiles,
	};
}

export function useChatMessageTransformer({
	aiMessages,
	dbMessages,
	persistedImageUrlsByMessageId,
	chatFiles,
}: {
	aiMessages: UIMessage[];
	dbMessages: ConvexMessage[] | undefined;
	persistedImageUrlsByMessageId: Record<string, string[]>;
	chatFiles: ConvexFile[] | undefined;
}) {
	const importedById = useMemo(
		() => mapImportedFlags(dbMessages),
		[dbMessages],
	);

	const storedGeneratedImageUrlsByMessageId = useMemo(
		() => mapStoredGeneratedImages(chatFiles),
		[chatFiles],
	);

	const displayMessages = useMemo(() => {
		if (aiMessages.length > 0) {
			return aiMessages
				.filter((msg) => !msg.id.startsWith("import-trigger-"))
				.map((msg) =>
					mapAiMessageToDisplayMessage({
						msg,
						importedById,
						persistedImageUrlsByMessageId,
						storedGeneratedImageUrlsByMessageId,
					}),
				);
		}
		return mergeImportedChunks(
			(dbMessages ?? []).map(
				(message) =>
					({
						id: message._id,
						role: message.role as "user" | "assistant",
						content: message.content,
						imageParts: storedGeneratedImageUrlsByMessageId[message._id] ?? [],
						isImported: !!message.metadata?.isImported,
					}) satisfies DisplayMessage,
			),
		);
	}, [
		aiMessages,
		dbMessages,
		importedById,
		persistedImageUrlsByMessageId,
		storedGeneratedImageUrlsByMessageId,
	]);

	return displayMessages;
}
