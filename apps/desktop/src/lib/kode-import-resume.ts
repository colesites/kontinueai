// An imported session that stopped on a usage limit: offer to carry on here
// right away (Kontinue isn't bound by the source tool's limit), and say what
// was left so you know what "continue" will do.

import { detectImportedLimit } from "./kode-import-sync";
import type { StoredImportContext } from "./kode-import";

const MAX_ITEMS = 4;

/** Bullets under "### Open work" in the import summary. */
export function openWorkFromSummary(summary: string | undefined): string[] {
  if (!summary) return [];
  const section = /###\s*Open work\s*\n([\s\S]*?)(?:\n###|\s*$)/i.exec(summary)?.[1] ?? "";
  return section
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s+/, "").trim())
    .filter((line) => line && !/^nothing (detected|left)/i.test(line))
    .slice(0, MAX_ITEMS);
}

export type ResumeOffer = {
  /** What was still open, most important first. */
  items: string[];
};

/** The offer for this chat, or null when it didn't stop on a limit, Kode
 *  already continued it, or you answered the offer. */
export function resumeOffer(
  context: Pick<StoredImportContext, "summary" | "resumeHandled"> | null,
  messages: { role: "user" | "assistant" | "system"; content: string }[],
): ResumeOffer | null {
  if (!context || context.resumeHandled || messages.length === 0) return null;
  const hit = detectImportedLimit({
    messages: messages.map((m) => ({ role: m.role, content: m.content })) as never,
    toolEvents: [],
  });
  if (!hit) return null;
  let items = openWorkFromSummary(context.summary);
  if (items.length === 0) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user" && m.content.trim());
    if (lastUser) {
      const text = lastUser.content.replace(/\s+/g, " ").trim();
      items = [`Your last request: "${text.length > 160 ? `${text.slice(0, 157)}…` : text}"`];
    }
  }
  return { items };
}

/** What Kode is sent when you accept the offer. */
export function resumePrompt(offer: ResumeOffer): string {
  const list = offer.items.length ? `\n\nStill open:\n${offer.items.map((item) => `- ${item}`).join("\n")}` : "";
  return `The previous session stopped on a usage limit before it finished. Continue the latest task from where it left off.${list}\n\nThe last tool calls may or may not have completed, so check the current state of the files before redoing anything.`;
}
