// Reads the structured parts of an AI SDK chat message (tool results, files,
// reasoning) into what a chat bubble renders. Shared by the web and Expo chat
// screens so a tool result shows up the same way on both.
//
// Parts are typed structurally so this module needs no AI SDK import: any
// UIMessage["parts"] array is assignable to `ReadonlyArray<MessagePart>`.

export type MessagePart = { type: string };
type AnyPart = MessagePart & Record<string, unknown>;

function asAny(part: MessagePart): AnyPart {
	return part as AnyPart;
}

function uint8ToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

/** Concatenated text parts. */
export function collectTextFromParts(
	parts: ReadonlyArray<MessagePart>,
): string {
	return parts
		.map(asAny)
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text as string)
		.join("");
}

export type ReasoningSplit = {
	/** Answer text with any `<think>` block removed. */
	content: string;
	/** Native reasoning parts plus any inline `<think>` text. */
	reasoningText?: string;
};

/**
 * Separates the model's reasoning from its answer. Native AI SDK reasoning
 * parts are used first; open models served through OpenRouter often inline a
 * `<think>…</think>` block in the text instead, which is pulled out here.
 */
export function splitReasoningFromParts(
	parts: ReadonlyArray<MessagePart>,
): ReasoningSplit {
	let content = collectTextFromParts(parts);
	let reasoningText = parts
		.map(asAny)
		.filter((part) => part.type === "reasoning")
		.map((part) =>
			typeof part.text === "string"
				? part.text
				: typeof part.reasoning === "string"
					? part.reasoning
					: "",
		)
		.join("");

	if (/<think/i.test(content)) {
		const thinkMatch = content.match(
			/<\s*think\s*>([\s\S]*?)(?:<\/\s*think\s*>|$)/i,
		);
		if (thinkMatch) {
			const extracted = thinkMatch[1]?.trim();
			if (extracted) {
				reasoningText = reasoningText
					? `${reasoningText}\n\n${extracted}`
					: extracted;
			}
			content = content
				.replace(/<\s*think\s*>[\s\S]*?<\/\s*think\s*>/gi, "")
				.trim();
			if (/^<\s*think/i.test(content)) {
				content = "";
			}
		}
	}

	const trimmed = reasoningText.trim();
	return { content, reasoningText: trimmed ? trimmed : undefined };
}

function extractToolGeneratedImageBase64(part: AnyPart): string | null {
	if (part.type === "tool-image_generation" && "output" in part) {
		const output = part.output as
			| { result?: string; images?: Array<string | { base64: string }> }
			| undefined;
		if (typeof output?.result === "string") return output.result;
		if (Array.isArray(output?.images)) {
			const first = output.images[0];
			return typeof first === "string" ? first : (first?.base64 ?? null);
		}
	}

	if (part.type === "tool-result" && part.toolName === "image_generation") {
		const candidate =
			(part.output as { result?: string } | undefined)?.result ??
			(part.result as string | undefined);
		return typeof candidate === "string" ? candidate : null;
	}

	return null;
}

// Providers return JPEG, PNG or WebP; label the data URL with the real type so
// downloads get the right extension.
export function sniffImageMime(base64: string): string {
	if (base64.startsWith("/9j/")) return "image/jpeg";
	if (base64.startsWith("iVBOR")) return "image/png";
	if (base64.startsWith("R0lGOD")) return "image/gif";
	return "image/webp";
}

export type ClockData = {
	timezone: string | null;
};

export function collectClockDataFromParts(
	parts: ReadonlyArray<MessagePart>,
): ClockData | null {
	for (const part of parts.map(asAny)) {
		if (part.type === "tool-get_current_time" && "output" in part) {
			const output = part.output as { timezone?: string | null } | undefined;
			return { timezone: output?.timezone ?? null };
		}
	}
	return null;
}

export type EmailDraft = {
	to: string;
	cc: string;
	subject: string;
	body: string;
};

export function collectEmailDraftFromParts(
	parts: ReadonlyArray<MessagePart>,
): EmailDraft | null {
	// Last compose_email tool call in the message wins (model may revise).
	let draft: EmailDraft | null = null;
	for (const part of parts.map(asAny)) {
		if (part.type === "tool-compose_email" && "output" in part) {
			const o = part.output as Partial<EmailDraft> | undefined;
			if (o && typeof o.subject === "string") {
				draft = {
					to: o.to ?? "",
					cc: o.cc ?? "",
					subject: o.subject ?? "",
					body: o.body ?? "",
				};
			}
		}
	}
	return draft;
}

export function collectImageUrlsFromParts(
	parts: ReadonlyArray<MessagePart>,
): string[] {
	const imageParts: string[] = [];
	for (const part of parts.map(asAny)) {
		if (part.type === "file" && typeof part.url === "string" && part.url) {
			imageParts.push(part.url);
		}

		if (part.type === "file" && "data" in part && part.data) {
			try {
				const mime =
					typeof part.mimeType === "string" ? part.mimeType : "image/png";
				imageParts.push(
					`data:${mime};base64,${uint8ToBase64(part.data as Uint8Array)}`,
				);
			} catch (error) {
				console.error("Failed to decode file part", error);
			}
		}

		const toolOutputBase64 = extractToolGeneratedImageBase64(part);
		if (toolOutputBase64) {
			imageParts.push(
				`data:${sniffImageMime(toolOutputBase64)};base64,${toolOutputBase64}`,
			);
		}
	}
	return imageParts;
}

export type MessageAttachment = {
	url: string;
	filename: string;
	mediaType: string;
};

// Files the USER attached to their message (shown as thumbnails, never as
// generated output).
export function collectAttachmentsFromParts(
	parts: ReadonlyArray<MessagePart>,
): MessageAttachment[] {
	const attachments: MessageAttachment[] = [];
	for (const part of parts.map(asAny)) {
		if (part.type !== "file" || typeof part.url !== "string" || !part.url)
			continue;
		attachments.push({
			url: part.url,
			filename:
				typeof part.filename === "string" && part.filename
					? part.filename
					: "Attachment",
			mediaType:
				typeof part.mediaType === "string" && part.mediaType
					? part.mediaType
					: "image/png",
		});
	}
	return attachments;
}

// Generated images arrive inline first (base64 while streaming), then as saved
// copies once persisted. Show ONE set: the saved copies when they cover every
// inline image, otherwise the inline ones. Merging both listed each image twice.
export function pickGeneratedImages(
	inline: string[],
	persisted: string[],
	stored: string[],
): string[] {
	for (const saved of [persisted, stored]) {
		if (saved.length > 0 && saved.length >= inline.length) {
			return [...new Set(saved)];
		}
	}
	return [...new Set(inline)];
}

export function mapStoredGeneratedImages(
	chatFiles:
		| ReadonlyArray<{ fileType: string; messageId?: string; blobUrl: string }>
		| undefined,
): Record<string, string[]> {
	const byMessage: Record<string, string[]> = {};
	for (const file of chatFiles ?? []) {
		if (file.fileType !== "generated-image" || !file.messageId) continue;
		const list = byMessage[file.messageId] ?? [];
		list.push(file.blobUrl);
		byMessage[file.messageId] = list;
	}
	return byMessage;
}

export function mapImportedFlags(
	messages:
		| ReadonlyArray<{ _id: string; metadata?: { isImported?: boolean } }>
		| undefined,
): Record<string, boolean> {
	const map: Record<string, boolean> = {};
	for (const message of messages ?? []) {
		map[message._id] = !!message.metadata?.isImported;
	}
	return map;
}

export function mergeImportedChunks<
	T extends {
		role: "user" | "assistant";
		content: string;
		imageParts: string[];
		isImported: boolean;
	},
>(messages: T[]): T[] {
	const merged: T[] = [];
	for (const message of messages) {
		const previous = merged[merged.length - 1];
		const canMergeImportedChunk =
			previous?.isImported &&
			message.isImported &&
			previous.role === message.role &&
			previous.imageParts.length === 0 &&
			message.imageParts.length === 0;

		if (previous && canMergeImportedChunk) {
			previous.content = `${previous.content}\n\n${message.content}`.trim();
			continue;
		}

		merged.push({ ...message });
	}

	return merged;
}

export type GeneratedFile = {
	name: string;
	url: string;
	bytes: number;
};

/**
 * Files produced by the run_code sandbox, pulled off the tool result so the
 * chat can render them as downloads. The model is told NOT to paste these URLs
 * into its text, so this is the only place they surface.
 */
export function collectGeneratedFilesFromParts(
	parts: ReadonlyArray<MessagePart>,
): GeneratedFile[] {
	const files: GeneratedFile[] = [];
	for (const part of parts.map(asAny)) {
		if (part.type !== "tool-run_code" || !("output" in part)) continue;
		const output = part.output as
			| { ok?: boolean; files?: GeneratedFile[] }
			| undefined;
		if (!output?.ok || !Array.isArray(output.files)) continue;
		for (const file of output.files) {
			if (
				file &&
				typeof file.name === "string" &&
				typeof file.url === "string"
			) {
				files.push({
					name: file.name,
					url: file.url,
					bytes: typeof file.bytes === "number" ? file.bytes : 0,
				});
			}
		}
	}
	return files;
}

export function formatFileBytes(bytes: number): string {
	if (!bytes) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
