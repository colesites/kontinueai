import type { FileUIPart } from "ai";

// The request body, retry trimming and error copy are shared with the Expo app
// through @repo/core so the two clients cannot drift apart.
export {
	type ChatErrorToast,
	type ChatRequestBodyState,
	getChatErrorToast,
	toChatRequestBody,
	trimMessagesToRetryTarget,
} from "@repo/core/chat-request";

export function withAttachmentSummary(content: string, files?: File[]): string {
	if (!files?.length) return content;
	const label = files.map((file) => file.name).join(", ");
	return `${content}\n\n[User attached ${files.length} file(s): ${label}]`;
}

function uint8ToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

async function toFileUIPart(file: File): Promise<FileUIPart> {
	const buffer = new Uint8Array(await file.arrayBuffer());
	const mediaType = file.type || "application/octet-stream";
	return {
		type: "file",
		filename: file.name,
		mediaType,
		url: `data:${mediaType};base64,${uint8ToBase64(buffer)}`,
	};
}

export async function toImageFileUIParts(
	files?: File[],
): Promise<FileUIPart[]> {
	if (!files?.length) return [];
	const imageFiles = files.filter((file) => file.type.startsWith("image/"));
	return Promise.all(imageFiles.map(toFileUIPart));
}

export function nonImageAttachments(files?: File[]): File[] {
	if (!files?.length) return [];
	return files.filter((file) => !file.type.startsWith("image/"));
}
