"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateText, createGateway } from "@repo/ai";

async function generateShortTitle(firstMessage: string): Promise<string> {
  try {
    const apiKey = process.env.AI_GATEWAY_TOKEN;
    if (!apiKey) {
      throw new Error("No API key");
    }

    const gw = createGateway({ apiKey });
    const modelId = "google/gemini-2.0-flash-001";

    const { text } = await generateText({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: gw(modelId) as any,
      system: `You generate very short chat titles (max 6 words). Respond with ONLY the title, no quotes or punctuation at the end.`,
      messages: [
        {
          role: "user",
          content: `Generate a short title for a chat that starts with this message:\n\n${firstMessage.slice(0, 500)}`,
        },
      ],
    });

    return text.trim().slice(0, 50);
  } catch (error) {
    console.error("Failed to generate title:", error);
    // Fallback to simple extraction
    const firstLine = firstMessage.split("\n")[0].trim();
    return firstLine.length > 50 ? firstLine.slice(0, 50) + "..." : firstLine;
  }
}

// Internal action to generate title using LLM
export const generateAndUpdateTitle = internalAction({
  args: {
    chatId: v.id("chats"),
    firstMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const title = await generateShortTitle(args.firstMessage);
    await ctx.runMutation(internal.messages.updateChatTitleInternal, {
      chatId: args.chatId,
      title,
    });
  },
});
