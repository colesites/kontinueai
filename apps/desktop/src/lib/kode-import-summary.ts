// AI-written architecture / decision summary for an imported session.
//
// The local memory extraction (kode-import.ts) is a quick keyword pass. This
// asks the model for a proper summary of the system's shape, the decisions
// and why, and the open work, which then goes into the continuation context.
// Falls back to the local summary when the model can't be reached.

import { KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { sendKodeChat } from "./kode-chat";
import { extractProjectMemory, type CodingSession } from "./kode-import";

const MAX_INPUT_CHARS = 60_000;

const INSTRUCTION = `You are reading a coding session transcript that will be continued by another agent.
Write a short summary in Markdown with exactly these sections:
### Architecture
How the parts of the system fit together (stack, main modules, data flow), as far as the transcript shows.
### Decisions
Bullet list: each decision or constraint, with the reason when given.
### Open work
Bullet list of what is unfinished or broken, most important first.
Use file paths from the transcript. No preamble, no closing remarks. At most 350 words.`;

/** The transcript text sent for summarizing, newest turns kept when long. */
export function summaryInput(session: Pick<CodingSession, "messages" | "toolEvents" | "filesChanged">): string {
  const files = session.filesChanged.slice(0, 40).join(", ");
  const turns = session.messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`);
  const kept: string[] = [];
  let used = files.length;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index].slice(0, 6_000);
    if (used + turn.length > MAX_INPUT_CHARS && kept.length > 0) break;
    kept.unshift(turn);
    used += turn.length;
  }
  return `${files ? `Files touched: ${files}\n\n` : ""}${kept.join("\n\n")}`;
}

/** Local fallback with the same section layout. */
export function localSummary(session: CodingSession): string {
  const lastUser = [...session.messages].reverse().find((m) => m.role === "user");
  const memory = extractProjectMemory(session, lastUser?.content ?? session.title);
  const list = (items: string[], empty: string) => (items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`);
  return [
    "### Architecture",
    memory.touchedAreas.length ? `Work touched: ${memory.touchedAreas.join(", ")}.` : "Not enough detail in the transcript.",
    "### Decisions",
    list(memory.decisions, "None stated explicitly."),
    "### Open work",
    list([memory.unfinishedWork, ...memory.knownIssues.slice(0, 3)].filter(Boolean), "Nothing detected."),
  ].join("\n");
}

export async function generateImportSummary(
  session: CodingSession,
  options: { modelId?: string; send?: typeof sendKodeChat } = {},
): Promise<{ summary: string; ai: boolean }> {
  const send = options.send ?? sendKodeChat;
  try {
    const response = await send({
      kontinueServer: true,
      modelId: options.modelId ?? KODE_MODEL_ID,
      messages: [{ role: "user", content: `${INSTRUCTION}\n\n---\n\n${summaryInput(session)}` }],
    });
    const text = response.content?.trim();
    if (text && text.includes("###")) return { summary: text, ai: true };
  } catch {
    // Offline or out of quota: use the local pass instead.
  }
  return { summary: localSummary(session), ai: false };
}
