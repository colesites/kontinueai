import { describe, expect, test } from "bun:test";

import { hashMessageContent, type CodingSession, type StoredImportContext } from "./kode-import";
import {
  contextsForEvent,
  decorateImportedMessage,
  detectImportedLimit,
  groupToolEvents,
  migrateImportContext,
  prepareImportedMessages,
  resolveConflict,
  scheduleImportContinue,
  stripImportDecorations,
  syncImportContext,
} from "./kode-import-sync";
import { getScheduledPrompts, removeScheduledPrompt } from "./kode-schedule";

const base: CodingSession = {
  provider: "claude_code",
  sessionId: "s1",
  title: "Fix auth",
  projectPath: null,
  projectRoot: null,
  gitBranch: null,
  model: null,
  startedAt: 1000,
  lastActivity: 5000,
  sourcePath: "/h/.claude/projects/p/s1.jsonl",
  messages: [
    { role: "user", content: "Fix login", timestamp: 1000 },
    { role: "assistant", content: "Looking at auth.ts", timestamp: 2000 },
    { role: "user", content: "Add a test", timestamp: 3000 },
    { role: "assistant", content: "Added auth.test.ts", timestamp: 4000 },
  ],
  toolEvents: [
    { name: "Edit", summary: "auth.ts", timestamp: 2100, detail: "--- auth.ts\n- a\n+ b\n", output: "ok" },
    { name: "Bash", summary: "bun test", timestamp: 4100, detail: "bun test", output: "1 pass" },
    { name: "Read", summary: "x.ts", timestamp: 4200 }, // no detail: no card
  ],
  filesChanged: ["auth.ts"],
  messagesDropped: 0,
  redactions: 0,
  truncated: false,
};

const context = (over: Partial<StoredImportContext> = {}): StoredImportContext => ({
  chatId: "chat1",
  provider: "claude_code",
  sessionId: "s1",
  sourcePath: base.sourcePath,
  projectPath: null,
  importedAt: 0,
  syncedMessageCount: 2,
  messageCount: 2,
  lastMessageHash: hashMessageContent("Looking at auth.ts"),
  lastActivity: null,
  filesChanged: [],
  redactions: 0,
  contextPrompt: "",
  ...over,
});

describe("rich imported turns", () => {
  test("groups tool calls under the turn they followed", () => {
    const groups = groupToolEvents(base.messages, base.toolEvents);
    expect(groups.map((g) => g.map((e) => e.name))).toEqual([[], ["Edit"], [], ["Bash"]]);
  });

  test("appends cards and strips them back to the source text", () => {
    const content = decorateImportedMessage(base.messages[1], [base.toolEvents[0]]);
    expect(content).toContain("```kode-tool");
    expect(JSON.parse(content.split("```kode-tool\n")[1].split("\n```")[0]).detail).toContain("+ b");
    expect(stripImportDecorations(content)).toBe("Looking at auth.ts");
  });

  test("saves screenshots into the project and adds image cards", async () => {
    const session = {
      ...base,
      messages: [{ role: "user" as const, content: "See screenshot", timestamp: 1, images: [{ mediaType: "image/png", data: "AAAA" }] }],
    };
    const saved: string[] = [];
    const out = await prepareImportedMessages(session.messages, [], {
      projectRoot: "/repo",
      saveImage: async (_root, _image, index) => {
        saved.push(`shot-${index}`);
        return `.kode/attachments/shot-${index}.png`;
      },
    });
    expect(saved).toEqual(["shot-0"]);
    expect(out.imagePaths).toEqual([".kode/attachments/shot-0.png"]);
    expect(out.messages[0].content).toContain("```kode-image");
    expect(stripImportDecorations(out.messages[0].content)).toBe("See screenshot");
  });
});

describe("usage limits in the source", () => {
  test("spots a limit after the last user turn", () => {
    const session = {
      ...base,
      messages: [
        ...base.messages,
        { role: "user" as const, content: "Keep going", timestamp: 5000 },
        { role: "system" as const, content: "Claude usage limit reached. Your limit will reset at 3pm.", timestamp: 5100 },
      ],
    };
    const hit = detectImportedLimit(session, new Date(2026, 0, 1, 10).getTime());
    expect(hit).not.toBeNull();
    expect(new Date(hit!.resetAt!).getHours()).toBe(15);
  });

  test("ignores a limit that real work came after", () => {
    const session = {
      ...base,
      messages: [
        { role: "user" as const, content: "Go", timestamp: 1 },
        { role: "system" as const, content: "rate limit hit, retrying", timestamp: 2 },
        { role: "assistant" as const, content: "x".repeat(500), timestamp: 3 },
      ],
    };
    expect(detectImportedLimit(session)).toBeNull();
  });

  test("queues one continue per reset time", () => {
    const now = 1_000_000;
    const hit = { resetAt: now + 3_600_000, message: "limit" };
    const first = scheduleImportContinue(context({ chatId: "limit-chat" }), hit, { modelId: "m", now });
    const second = scheduleImportContinue(first, hit, { modelId: "m", now });
    const queued = getScheduledPrompts().filter((p) => p.chatId === "limit-chat");
    expect(queued).toHaveLength(1);
    expect(queued[0].fireAt).toBeGreaterThan(hit.resetAt);
    expect(second.limitScheduledFor).toBe(hit.resetAt);
    expect(scheduleImportContinue(context({ chatId: "off", autoContinue: false }), hit, { modelId: "m", now }).limitScheduledFor).toBeUndefined();
    for (const item of queued) removeScheduledPrompt(item.id);
  });
});

describe("syncImportContext", () => {
  test("appends new turns with cards and moves the anchor", async () => {
    const appended: { expected: number; contents: string[] }[] = [];
    const outcome = await syncImportContext(context({ chatMessageCount: 2 }), {
      readSession: async () => base,
      append: async ({ expectedMessageCount, messages }) => {
        appended.push({ expected: expectedMessageCount, contents: messages.map((m) => m.content) });
        return expectedMessageCount + messages.length;
      },
    });
    expect(outcome.appended).toBe(2);
    expect(appended[0].expected).toBe(2);
    expect(appended[0].contents[1]).toContain("kode-tool");
    expect(outcome.context.chatMessageCount).toBe(4);
    expect(outcome.context.lastMessageHash).toBe(hashMessageContent("Added auth.test.ts"));
    expect(outcome.conflict).toBeNull();
  });

  test("records a diverged source as a conflict and pauses auto-sync", async () => {
    const outcome = await syncImportContext(context({ lastMessageHash: "deadbeef" }), {
      readSession: async () => base,
      append: async () => 0,
    });
    expect(outcome.conflict?.kind).toBe("diverged");
    expect(outcome.context.autoSync).toBe(false);
  });

  test("records Kode turns in between as chat_changed", async () => {
    const outcome = await syncImportContext(context(), {
      readSession: async () => base,
      append: async () => {
        throw new Error("This chat is out of sync with the imported session. Refresh it and try again.");
      },
    });
    expect(outcome.conflict?.kind).toBe("chat_changed");
  });

  test("conflict fixes move the sync point", () => {
    const reanchored = resolveConflict(context({ conflict: { kind: "diverged", message: "", at: 1 } }), "reanchor", { session: base });
    expect(reanchored.lastMessageHash).toBe(hashMessageContent("Added auth.test.ts"));
    expect(reanchored.conflict).toBeUndefined();
    expect(reanchored.autoSync).toBe(true);
    const after = resolveConflict(context(), "after_kode_turns", { chatMessageCount: 7 });
    expect(after.chatMessageCount).toBe(7);
  });
});

describe("migration", () => {
  test("rebuilds the fingerprint from the chat's own turns", () => {
    const old = context({ lastMessageHash: undefined, syncedMessageCount: undefined, version: undefined, sourcePath: undefined });
    const persisted = [
      { role: "system", content: "Imported from Claude Code" },
      { role: "user", content: "Fix login" },
      { role: "assistant", content: "Looking at auth.ts\n\n```kode-tool\n{}\n```" },
      { role: "user", content: "typed in Kode" },
    ];
    const migrated = migrateImportContext(old, base, persisted)!;
    expect(migrated.syncedMessageCount).toBe(2);
    expect(migrated.lastMessageHash).toBe(hashMessageContent("Looking at auth.ts"));
    expect(migrated.chatMessageCount).toBe(4);
    expect(migrated.sourcePath).toBe(base.sourcePath);
  });

  test("gives up when nothing matches", () => {
    expect(migrateImportContext(context({ lastMessageHash: undefined }), base, [{ role: "user", content: "other" }])).toBeNull();
  });
});

test("hook events find their imported chats", () => {
  const contexts = [context(), context({ chatId: "c2", sessionId: "s2", sourcePath: "/x.jsonl" })];
  expect(contextsForEvent(contexts, { sessionId: "s1", transcriptPath: null }).map((c) => c.chatId)).toEqual(["chat1"]);
  expect(contextsForEvent(contexts, { sessionId: null, transcriptPath: "/x.jsonl" }).map((c) => c.chatId)).toEqual(["c2"]);
});

test("large transcripts diff and decorate quickly", async () => {
  const messages = Array.from({ length: 5000 }, (_, i) => ({
    role: (i % 2 ? "assistant" : "user") as "user" | "assistant",
    content: `turn ${i} ${"x".repeat(400)}`,
    timestamp: i * 10,
  }));
  const toolEvents = Array.from({ length: 5000 }, (_, i) => ({ name: "Bash", summary: "ls", detail: "ls", timestamp: i * 10 + 5 }));
  const session = { ...base, messages, toolEvents };
  const started = performance.now();
  const outcome = await syncImportContext(
    context({ syncedMessageCount: 10, messageCount: 10, lastMessageHash: hashMessageContent(messages[9].content), chatId: "big" }),
    { readSession: async () => session, append: async ({ expectedMessageCount, messages: m }) => expectedMessageCount + m.length },
  );
  expect(outcome.appended).toBe(4990);
  expect(performance.now() - started).toBeLessThan(3000);
});
