import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { uploadFile } from "@repo/core/file-upload";
import type { UIMessage } from "ai";
import { useMutation } from "convex/react";
import { useCallback, useRef } from "react";
import type { DisplayMessage } from "./useChatMessageTransformer";

interface ConvexMessage {
	_id: string;
	role: "user" | "assistant" | "system";
	content: string;
	metadata?: { isImported?: boolean };
}

export function useChatPersistence({
	chatId,
	dbMessages,
}: {
	chatId: Id<"chats">;
	dbMessages: ConvexMessage[] | undefined;
}) {
	const addMessage = useMutation(api.messages.addMessage);
	const createFileRecord = useMutation(api.files.createFileRecord);

	const lastSavedAssistantIdRef = useRef<string | null>(null);
	const savedGeneratedImagesByAssistantIdRef = useRef<Set<string>>(new Set());

	const compressGeneratedImageBlob = useCallback(async (blob: Blob) => {
		if (!blob.type.startsWith("image/")) return blob;
		// Keep generated chat images below Starter's 5 MB per-file ceiling so the
		// same K-Image result can be persisted on every plan that includes it.
		const targetMaxBytes = 4 * 1024 * 1024;
		if (blob.size <= targetMaxBytes && blob.type === "image/webp") return blob;

		const objectUrl = URL.createObjectURL(blob);
		const image = await new Promise<HTMLImageElement>((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error("Failed to decode generated image"));
			img.src = objectUrl;
		});

		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			URL.revokeObjectURL(objectUrl);
			return blob;
		}

		const render = async (max: number, q: number) => {
			const scale = Math.min(1, max / Math.max(image.width, image.height));
			canvas.width = Math.max(1, Math.round(image.width * scale));
			canvas.height = Math.max(1, Math.round(image.height * scale));
			ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
			return new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(result) => {
						if (result) resolve(result);
						else reject(new Error("Failed to encode generated image"));
					},
					"image/webp",
					q,
				);
			});
		};

		try {
			for (const max of [2200, 1800, 1400, 1024]) {
				for (const q of [0.9, 0.7, 0.5]) {
					const candidate = await render(max, q);
					if (candidate.size <= targetMaxBytes) return candidate;
				}
			}
			return blob;
		} finally {
			URL.revokeObjectURL(objectUrl);
		}
	}, []);

	const persistAssistantTurn = useCallback(
		async ({
			lastMessage,
			displayMessage,
			selectedModel,
			onImagesPersisted,
		}: {
			lastMessage: UIMessage;
			displayMessage: DisplayMessage;
			selectedModel: string;
			onImagesPersisted: (urls: string[]) => void;
		}) => {
			if (dbMessages?.some((m) => m._id === lastMessage.id)) {
				lastSavedAssistantIdRef.current = lastMessage.id;
				return;
			}
			if (lastSavedAssistantIdRef.current === lastMessage.id) return;

			const content =
				lastMessage.parts
					.filter((p): p is { type: "text"; text: string } => p.type === "text")
					.map((p) => p.text)
					.join("")
					.trim() ||
				(displayMessage.content !==
				"_No text was returned for this step. Please retry or switch models._"
					? displayMessage.content
					: "") ||
				(displayMessage.imageParts.length ? "Generated image." : "");

			if (!content) return;
			lastSavedAssistantIdRef.current = lastMessage.id;

			try {
				const persistedMessageId = await addMessage({
					chatId,
					role: "assistant",
					content,
					model: selectedModel,
				});

				if (
					displayMessage.imageParts.length &&
					!savedGeneratedImagesByAssistantIdRef.current.has(lastMessage.id)
				) {
					savedGeneratedImagesByAssistantIdRef.current.add(lastMessage.id);
					const persistedResults = await Promise.all(
						displayMessage.imageParts.map(async (source, index) => {
							try {
								const res = await fetch(source);
								const blob = await res.blob();
								const compressed = await compressGeneratedImageBlob(blob);
								const file = new File(
									[compressed],
									`gen-${Date.now()}-${index}.webp`,
									{ type: "image/webp" },
								);
								const uploaded = await uploadFile(file);
								await createFileRecord({
									chatId,
									messageId: persistedMessageId,
									blobUrl: uploaded.url,
									pathname: uploaded.pathname,
									filename: uploaded.filename,
									contentType: uploaded.contentType,
									size: uploaded.size,
									fileType: "generated-image",
								});
								return uploaded.url;
							} catch (e) {
								console.error("failed to persist image", e);
								return null;
							}
						}),
					);
					const persistedUrls = persistedResults.filter(
						(url): url is string => url !== null,
					);
					if (persistedUrls.length) onImagesPersisted(persistedUrls);
				}
			} catch (e) {
				lastSavedAssistantIdRef.current = null;
				console.error("failed to persist assistant message", e);
			}
		},
		[
			addMessage,
			chatId,
			createFileRecord,
			compressGeneratedImageBlob,
			dbMessages,
		],
	);

	return { addMessage, persistAssistantTurn, lastSavedAssistantIdRef };
}
