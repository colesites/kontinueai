import { v } from "convex/values";
import { internalAction } from "../convex/_generated/server";

export const processMessageForMemory = internalAction({
	args: {
		chatId: v.id("chats"),
		messageId: v.id("messages"),
	},
	handler: async () => null,
});

export const processMessageEmbedding = internalAction({
	args: { messageId: v.id("messages") },
	handler: async () => null,
});
