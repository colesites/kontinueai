import type { FileUIPart, UIMessage } from "ai";

export type ChatRequestBodyState = {
  selectedModel: string;
  webSearchEnabled: boolean;
  imageAspectRatio: string;
  imageSize: string | null;
};

const PAID_PLAN_REQUIRED_PATTERN =
  /starter or pro plan required|starter plan required|pro plan required|requires pro|paid plan required/i;

const UNAUTHORIZED_PATTERN = /unauthorized|status\s*401/i;
const INPUT_TOO_LONG_PATTERN =
  /input_too_long|message is too long|input tokens|too many tokens|max input tokens/i;

export type ChatErrorToast =
  | {
    title: "This model requires a paid plan.";
    description: "Choose a free model or upgrade to Starter/Pro.";
  }
  | {
    title: "You're not signed in.";
    description: "Please refresh and sign in again.";
  }
  | {
    title: "Message too long.";
    description: "Shorten your message and try again.";
  }
  | { title: "AI didn’t respond."; description: string };

export function getChatErrorToast(message: string): ChatErrorToast {
  if (PAID_PLAN_REQUIRED_PATTERN.test(message)) {
    return {
      title: "This model requires a paid plan.",
      description: "Choose a free model or upgrade to Starter/Pro.",
    };
  }

  if (UNAUTHORIZED_PATTERN.test(message)) {
    return {
      title: "You're not signed in.",
      description: "Please refresh and sign in again.",
    };
  }

  if (INPUT_TOO_LONG_PATTERN.test(message)) {
    return {
      title: "Message too long.",
      description: "Shorten your message and try again.",
    };
  }

  return {
    title: "AI didn’t respond.",
    description: message,
  };
}

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

export async function toImageFileUIParts(files?: File[]): Promise<FileUIPart[]> {
  if (!files?.length) return [];
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  return Promise.all(imageFiles.map(toFileUIPart));
}

export function nonImageAttachments(files?: File[]): File[] {
  if (!files?.length) return [];
  return files.filter((file) => !file.type.startsWith("image/"));
}

function getClientTimezone(): string | null {
  if (typeof Intl === "undefined") return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function toChatRequestBody(state: ChatRequestBodyState): {
  model: string;
  webSearchEnabled: boolean;
  imageAspectRatio: string;
  imageSize: string | null;
  userTimezone: string | null;
} {
  return {
    model: state.selectedModel,
    webSearchEnabled: state.webSearchEnabled,
    imageAspectRatio: state.imageAspectRatio,
    imageSize: state.imageSize,
    userTimezone: getClientTimezone(),
  };
}

export function trimMessagesToRetryTarget(
  messages: UIMessage[],
  retryMessageId: string,
): UIMessage[] {
  const targetIndex = messages.findIndex((message) => message.id === retryMessageId);
  const userIndex = messages
    .slice(0, targetIndex)
    .findLastIndex((message) => message.role === "user");
  return userIndex === -1 ? messages : messages.slice(0, userIndex + 1);
}
