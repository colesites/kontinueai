export function isLikelyImageGenerationRequest(options: {
  status: string;
  selectedModel: string;
  getCapabilities: (modelId: string) => string[];
  displayMessages: Array<{ role: "user" | "assistant"; content: string }>;
}): boolean {
  const { status, selectedModel, getCapabilities, displayMessages } = options;
  if (status !== "submitted") return false;
  if (!getCapabilities(selectedModel).includes("image-generation")) return false;

  const lastUserMessage = displayMessages.findLast(
    (message) => message.role === "user",
  );
  if (!lastUserMessage) return false;

  return /\b(image|picture|draw|generate|create)\b/i.test(
    lastUserMessage.content.toLowerCase(),
  );
}
