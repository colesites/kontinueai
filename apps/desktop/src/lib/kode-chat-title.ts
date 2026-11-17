// Chat titles. A new chat gets a short title from the first message straight
// away, then Kode 1.0 names it in 2 to 4 words (unless the message was already
// short enough to be its own title).

import { KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { sendKodeChat } from "@/lib/kode-chat";

// Short: the title sits in the header next to file and browser tabs.
const MAX_TITLE = 32;

/** The first sentence of the message, cut at a word, without an ellipsis. */
export function quickTitle(input: string): string {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return "New chat";
  const sentence = text.split(/(?<=[.?!])\s|\s[-–—]\s/)[0] ?? text;
  if (sentence.length <= MAX_TITLE) return sentence.replace(/[.,;:]+$/, "");
  const cut = sentence.slice(0, MAX_TITLE + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 12 ? cut.slice(0, space) : cut.slice(0, MAX_TITLE)).replace(/[.,;:]+$/, "");
}

/** Whether the message is already a fine title, so no model call is needed. */
export function needsDraftTitle(input: string): boolean {
  const text = input.replace(/\s+/g, " ").trim();
  return text.length > 0 && quickTitle(text) !== text;
}

const INSTRUCTION =
  "Name this coding chat from the user's first message. Reply with only the title: 2 to 4 words, at most 30 characters, sentence case, no quotes, no trailing punctuation, no emoji. Name the task, not the user (\"Fix terminal tab counting\", not \"User wants help\").";

/** A short title from Kode 1.0, or null if it couldn't make one. */
export async function draftChatTitle(message: string): Promise<string | null> {
  try {
    const response = await sendKodeChat({
      kontinueServer: true,
      modelId: KODE_MODEL_ID,
      reasoningEnabled: false,
      messages: [{ role: "user", content: `${INSTRUCTION}\n\nMessage:\n${message.slice(0, 4000)}` }],
    });
    return cleanTitle(response.content ?? "");
  } catch {
    return null;
  }
}

export function cleanTitle(raw: string): string | null {
  const line = raw.trim().split("\n")[0] ?? "";
  const title = line
    .replace(/^(title:\s*)/i, "")
    .replace(/^["'`*#\s]+|["'`*\s]+$/g, "")
    .replace(/[.!]+$/, "")
    .trim();
  if (title.length < 3 || title.length > 40) return null;
  return title;
}
