import { describe, it, expect, mock } from "bun:test";
import { IMAGE_MODELS, VIDEO_MODELS } from "@repo/ai/lib/canvas-models";

// Mocking the AI SDK and Gateway
mock.module("ai", () => ({
  experimental_generateImage: () => { },
  experimental_generateVideo: () => { },
  generateText: () => { },
}));

mock.module("@ai-sdk/gateway", () => ({
  gateway: {
    imageModel: (id: string) => ({ id, type: "image" }),
    videoModel: (id: string) => ({ id, type: "video" }),
  },
}));

describe("Canvas Model Generation Routing", () => {
  it("should identify chat models that need tool calling", () => {
    const chatModelKeywords = ["gpt", "gemini", "grok"];

    const imageChatModels = IMAGE_MODELS.filter((m) =>
      chatModelKeywords.some((k) => m.id.toLowerCase().includes(k)),
    );

    const videoChatModels = VIDEO_MODELS.filter((m) =>
      chatModelKeywords.some((k) => m.id.toLowerCase().includes(k)),
    );

    console.log(
      "Image models needing tools:",
      imageChatModels.map((m) => m.id),
    );
    console.log(
      "Video models needing tools:",
      videoChatModels.map((m) => m.id),
    );

    // In a real test, we would hit the API route and verify if generateText was called
    // instead of experimental_generateImage for these models.
    expect(imageChatModels.length).toBeGreaterThan(0);
    expect(videoChatModels.length).toBeGreaterThan(0);
  });
});
