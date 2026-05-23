import { describe, expect, test } from "bun:test";
import { getChatErrorToast, toChatRequestBody } from "./chat-messaging";

describe("getChatErrorToast", () => {
  test("maps input-too-long errors to a friendly toast", () => {
    const toast = getChatErrorToast(
      '[400] {"code":"INPUT_TOO_LONG","error":"Your message is too long for your current plan."}',
    );

    expect(toast).toEqual({
      title: "Message too long.",
      description: "Shorten your message and try again.",
    });
  });

  test("maps paid plan requirement errors", () => {
    const toast = getChatErrorToast("Starter or Pro plan required for this model");

    expect(toast).toEqual({
      title: "This model requires a paid plan.",
      description: "Choose a free model or upgrade to Starter/Pro.",
    });
  });

  test("maps unauthorized errors", () => {
    const toast = getChatErrorToast("Unauthorized");

    expect(toast).toEqual({
      title: "You're not signed in.",
      description: "Please refresh and sign in again.",
    });
  });

  test("includes chatId in chat request payload", () => {
    const body = toChatRequestBody(
      {
        selectedModel: "openai/gpt-5.5",
        webSearchEnabled: true,
        imageAspectRatio: "1:1",
        imageSize: "1024x1024",
      },
      "chat_123",
    );

    expect(body.chatId).toBe("chat_123");
    expect(body.model).toBe("openai/gpt-5.5");
    expect(body.webSearchEnabled).toBe(true);
  });
});
