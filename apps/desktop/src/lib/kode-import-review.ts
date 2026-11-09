// Redaction review before an import is uploaded.
//
// Rust already replaces known secret shapes with [REDACTED_SECRET]. This lets
// the user see each redaction in context, add their own terms (a client name,
// an internal URL) and leave whole turns out, before anything leaves the
// device.

import type { CodingSession } from "./kode-import";

export const REDACTION_MARK = "[REDACTED_SECRET]";
export const CUSTOM_MARK = "[REDACTED]";

export type RedactionHit = {
  /** -1 for tool calls and the title (they can't be left out one by one). */
  messageIndex: number;
  /** "user", "assistant", "system", or where else it was ("Bash output"). */
  role: string;
  /** Text around the redaction, for review. */
  snippet: string;
  kind: "secret" | "custom";
};

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + length + 60);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every redaction already made, plus matches for the user's own terms. */
export function findRedactions(
  session: Pick<CodingSession, "messages"> & Partial<Pick<CodingSession, "toolEvents" | "title">>,
  terms: string[] = [],
): RedactionHit[] {
  const hits: RedactionHit[] = [];
  const custom = terms.map((term) => term.trim()).filter((term) => term.length >= 2);
  for (const [messageIndex, message] of session.messages.entries()) {
    let at = message.content.indexOf(REDACTION_MARK);
    while (at !== -1) {
      hits.push({ messageIndex, role: message.role, kind: "secret", snippet: snippetAround(message.content, at, REDACTION_MARK.length) });
      at = message.content.indexOf(REDACTION_MARK, at + REDACTION_MARK.length);
    }
    for (const term of custom) {
      const pattern = new RegExp(escapeRegExp(term), "gi");
      for (const match of message.content.matchAll(pattern)) {
        hits.push({ messageIndex, role: message.role, kind: "custom", snippet: snippetAround(message.content, match.index ?? 0, term.length) });
      }
    }
  }
  // Tool commands and their output (terminal logs often hold tokens).
  const extra = (text: string | undefined, where: string) => {
    if (!text) return;
    let at = text.indexOf(REDACTION_MARK);
    while (at !== -1) {
      hits.push({ messageIndex: -1, role: where, kind: "secret", snippet: snippetAround(text, at, REDACTION_MARK.length) });
      at = text.indexOf(REDACTION_MARK, at + REDACTION_MARK.length);
    }
    for (const term of custom) {
      for (const match of text.matchAll(new RegExp(escapeRegExp(term), "gi"))) {
        hits.push({ messageIndex: -1, role: where, kind: "custom", snippet: snippetAround(text, match.index ?? 0, term.length) });
      }
    }
  };
  for (const event of session.toolEvents ?? []) {
    extra(event.summary, `${event.name} call`);
    extra(event.detail, `${event.name} input`);
    extra(event.output, `${event.name} output`);
  }
  extra(session.title, "title");
  return hits;
}

/**
 * The session as it will be uploaded: custom terms replaced everywhere
 * (messages, tool cards, title, file list) and excluded turns removed.
 */
export function applyReview(
  session: CodingSession,
  review: { terms: string[]; excluded: Set<number> },
): CodingSession {
  const terms = review.terms.map((term) => term.trim()).filter((term) => term.length >= 2);
  let added = 0;
  const scrub = (text: string): string => {
    let out = text;
    for (const term of terms) {
      out = out.replace(new RegExp(escapeRegExp(term), "gi"), () => {
        added += 1;
        return CUSTOM_MARK;
      });
    }
    return out;
  };
  const messages = session.messages
    .filter((_, index) => !review.excluded.has(index))
    .map((message) => ({ ...message, content: scrub(message.content) }));
  const toolEvents = session.toolEvents.map((event) => ({
    ...event,
    summary: scrub(event.summary),
    ...(event.detail ? { detail: scrub(event.detail) } : {}),
    ...(event.output ? { output: scrub(event.output) } : {}),
  }));
  return {
    ...session,
    title: scrub(session.title),
    messages,
    toolEvents,
    filesChanged: session.filesChanged.map(scrub),
    redactions: session.redactions + added,
  };
}
