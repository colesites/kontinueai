import type { RawMessage, Message } from "../types";

export function normalizeMessages(rawMessages: RawMessage[]): Message[] {
  const messages: Message[] = [];

  for (let i = 0; i < rawMessages.length; i++) {
    const raw = rawMessages[i];
    const cleanedContent = cleanContent(raw.content);

    if (cleanedContent.length > 0) {
      messages.push({
        id: `msg_${i}_text`,
        role: raw.role,
        type: "text",
        content: cleanedContent,
      });
    }

    for (let j = 0; j < raw.codes.length; j++) {
      const code = raw.codes[j];
      messages.push({
        id: `msg_${i}_code_${j}`,
        role: raw.role,
        type: "code",
        content: code.code,
        language: code.language,
      });
    }

    for (let j = 0; j < raw.images.length; j++) {
      messages.push({
        id: `msg_${i}_img_${j}`,
        role: raw.role,
        type: "image",
        url: raw.images[j],
      });
    }

    for (let j = 0; j < raw.files.length; j++) {
      messages.push({
        id: `msg_${i}_file_${j}`,
        role: raw.role,
        type: "file",
        url: raw.files[j],
      });
    }
  }

  return messages;
}

function cleanContent(text: string): string {
  let cleaned = text.trim();

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  cleaned = cleaned.replace(/Copy code\n?/g, "");
  cleaned = cleaned.replace(/^Copy$/gm, "");

  cleaned = cleaned.replace(/^You said\s*:?\s*/i, "");
  cleaned = cleaned.replace(/^ChatGPT said:\s*/i, "");
  cleaned = cleaned.replace(/^Claude said:\s*/i, "");
  cleaned = cleaned.replace(/^Assistant:\s*/i, "");

  return cleaned.trim();
}
