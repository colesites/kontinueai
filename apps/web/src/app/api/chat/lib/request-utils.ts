import type { UIMessage } from "ai";
import type { OpenAIImageSize } from "./types";

export function createInputTooLongResponse(options: {
  tierLabel: string;
  maxInputTokens: number;
  estimatedInputTokens: number;
}): Response {
  const payload = {
    code: "INPUT_TOO_LONG",
    error:
      "Your message is too long for your current plan. Please shorten it and try again.",
    details: {
      tier: options.tierLabel,
      maxInputTokens: options.maxInputTokens,
      estimatedInputTokens: options.estimatedInputTokens,
    },
  };

  return new Response(JSON.stringify(payload), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export function toOpenAIImageSize(
  imageAspectRatio?: string | null,
  imageSize?: string | null,
): OpenAIImageSize {
  const allowed: OpenAIImageSize[] = ["1024x1024", "1024x1536", "1536x1024"];
  if (imageSize && (allowed as readonly string[]).includes(imageSize)) {
    return imageSize as OpenAIImageSize;
  }
  if (imageSize === "auto") return "auto";

  switch (imageAspectRatio) {
    case "9:16":
    case "9:21":
    case "1:9":
    case "3:7":
    case "2:3":
    case "1:2":
    case "4:5":
    case "1:4":
    case "3:4":
      return "1024x1536";
    case "21:9":
    case "16:9":
    case "7:3":
    case "4:1":
    case "3:2":
    case "5:3":
    case "9:7":
    case "5:4":
    case "4:3":
      return "1536x1024";
    case "1:1":
      return "1024x1024";
    default:
      return "auto";
  }
}

export function logDetailedError(context: string, error: unknown): void {
  const asRecord =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;

  console.error(`[chat-debug] ${context}`, {
    name: error instanceof Error ? error.name : undefined,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    statusCode:
      typeof asRecord?.statusCode === "number" ? asRecord.statusCode : undefined,
    cause: asRecord?.cause,
    responseBody:
      asRecord?.responseBody ??
      asRecord?.response ??
      asRecord?.data ??
      asRecord?.body,
  });
}

export function getLastUserContent(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== "user" || !Array.isArray(message.parts)) continue;
    return message.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("");
  }
  return "";
}

export function hasUserFileAttachments(messages: UIMessage[]): boolean {
  return messages.some((message) => {
    if (message.role !== "user" || !Array.isArray(message.parts)) {
      return false;
    }

    return message.parts.some((part) => {
      if (!part || typeof part !== "object") return false;
      return (part as { type?: string }).type === "file";
    });
  });
}

export function shouldStopAfterAnswer(options: {
  steps: Array<{
    text: string;
    toolCalls: Array<{ toolName: string }>;
  }>;
}): boolean {
  const lastStep = options.steps[options.steps.length - 1];
  if (!lastStep) return false;

  const usedAnyTool = options.steps.some((step) => step.toolCalls.length > 0);
  if (!usedAnyTool) return false;

  const hasTextAnswer = lastStep.text.trim().length > 0;
  const hasNewToolCalls = lastStep.toolCalls.length > 0;
  return hasTextAnswer && !hasNewToolCalls;
}
