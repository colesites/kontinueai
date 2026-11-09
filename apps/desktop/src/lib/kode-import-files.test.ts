import { describe, expect, test } from "bun:test";

import { exportMarkdown, exportSessionJson, parseTranscriptFile } from "./kode-import-files";
import { applyReview, findRedactions } from "./kode-import-review";
import { contextFromRemote, resolveFolderForPath } from "./kode-import-remote";
import { localSummary, summaryInput, generateImportSummary } from "./kode-import-summary";
import type { CodingSession } from "./kode-import";

const session: CodingSession = {
  provider: "claude_code",
  sessionId: "s1",
  title: "Acme billing",
  projectPath: "/Users/a/acme",
  projectRoot: "/Users/a/acme",
  gitBranch: null,
  model: null,
  startedAt: null,
  lastActivity: null,
  sourcePath: "/x.jsonl",
  messages: [
    { role: "user", content: "Use Stripe for Acme Corp. Key is [REDACTED_SECRET].", timestamp: 1 },
    { role: "assistant", content: "Wired Stripe for Acme Corp in billing.ts", timestamp: 2 },
    { role: "user", content: "never mind this one", timestamp: 3 },
  ],
  toolEvents: [{ name: "Bash", summary: "curl acme corp", detail: "curl https://acme corp" , timestamp: 2 }],
  filesChanged: ["billing.ts"],
  messagesDropped: 0,
  redactions: 1,
  truncated: false,
};

describe("transcript files", () => {
  test("round-trips Kode's JSON export", () => {
    const parsed = parseTranscriptFile(exportSessionJson(session), "export.json");
    expect(parsed.messages).toHaveLength(3);
    expect(parsed.sessionId).toBe("s1");
    expect(parsed.sourcePath).toBe("export.json");
  });

  test("reads generic JSON chat exports", () => {
    const parsed = parseTranscriptFile(
      JSON.stringify({ title: "Chat", messages: [{ role: "human", content: [{ type: "text", text: "hi" }] }, { author: "ai", text: "hello" }] }),
      "chat.json",
    );
    expect(parsed.provider).toBe("file");
    expect(parsed.title).toBe("Chat");
    expect(parsed.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  test("reads Markdown with headings and keeps code fences intact", () => {
    const md = exportMarkdown("Fix it", [
      { role: "user", content: "Fix the bug" },
      { role: "assistant", content: "Done:\n```ts\n## User\nconst a = 1\n```" },
    ]);
    const parsed = parseTranscriptFile(md, "chat.md");
    expect(parsed.title).toBe("Fix it");
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1].content).toContain("## User");
  });

  test("reads prefixed transcripts and rejects empty files", () => {
    const parsed = parseTranscriptFile("User: hello\n\nAssistant: hi there\nmore", "c.md");
    expect(parsed.messages.map((m) => m.content)).toEqual(["hello", "hi there\nmore"]);
    expect(() => parseTranscriptFile("just notes", "n.md")).toThrow(/No conversation/);
  });
});

describe("redaction review", () => {
  test("lists secret redactions and custom terms", () => {
    const hits = findRedactions(session, ["Acme Corp"]);
    expect(hits.filter((h) => h.kind === "secret")).toHaveLength(1);
    // Two in messages, plus the tool call's summary and command.
    expect(hits.filter((h) => h.kind === "custom")).toHaveLength(4);
  });

  test("applies terms everywhere and drops excluded turns", () => {
    const reviewed = applyReview(session, { terms: ["acme corp"], excluded: new Set([2]) });
    expect(reviewed.messages).toHaveLength(2);
    expect(reviewed.messages[0].content).not.toMatch(/acme corp/i);
    expect(reviewed.toolEvents[0].detail).toBe("curl https://[REDACTED]");
    expect(reviewed.redactions).toBe(1 + 4);
  });
});

describe("cross-device", () => {
  const folders = [
    { id: "f1", name: "acme", path: "/home/b/code/acme" },
    { id: "f2", name: "web", path: "/home/b/code/other/web" },
    { id: "f3", name: "web", path: "/home/b/code/third/web" },
  ];
  test("matches folders by path, tail, then unique name", () => {
    expect(resolveFolderForPath("/home/b/code/acme/", folders)?.id).toBe("f1");
    expect(resolveFolderForPath("/Users/a/code/acme", folders)?.id).toBe("f1");
    expect(resolveFolderForPath("/Users/a/x/other/web", folders)?.id).toBe("f2");
    expect(resolveFolderForPath("/Users/a/web", folders)).toBeNull(); // ambiguous
  });

  test("builds a context from Convex's import source", () => {
    const context = contextFromRemote(
      "c1",
      { provider: "codex", sessionId: "t1", projectPath: "/Users/a/acme", importedAt: 5, syncedMessageCount: 8 },
      { projectPath: "/home/b/code/acme" },
    );
    expect(context.projectPath).toBe("/home/b/code/acme");
    expect(context.autoSync).toBe(false);
    expect(context.contextPrompt).toContain("another device");
    expect(context.messageCount).toBe(8);
  });
});

describe("AI summary", () => {
  test("keeps the newest turns within budget", () => {
    const long = { ...session, messages: Array.from({ length: 50 }, (_, i) => ({ role: "user" as const, content: `${i} ${"y".repeat(5000)}`, timestamp: i })) };
    const input = summaryInput(long);
    expect(input.length).toBeLessThan(70_000);
    expect(input).toContain("USER: 49");
    expect(input).not.toContain("USER: 0 ");
  });

  test("falls back to the local summary when the model fails", async () => {
    const result = await generateImportSummary(session, { send: async () => { throw new Error("offline"); } });
    expect(result.ai).toBe(false);
    expect(result.summary).toContain("### Decisions");
    expect(localSummary(session)).toContain("### Open work");
    const ok = await generateImportSummary(session, { send: async () => ({ content: "### Architecture\nx" }) as never });
    expect(ok).toEqual({ summary: "### Architecture\nx", ai: true });
  });
});

test("uses the importing device's full context when it was shared", async () => {
  const { contextFromRemote, uploadKey } = await import("./kode-import-remote");
  const context = contextFromRemote(
    "c1",
    { provider: "claude_code", sessionId: "s", projectPath: "/Users/a/acme", importedAt: 1 },
    { projectPath: "/home/b/acme" },
    { contextPrompt: "## CONTINUATION CONTEXT\nDecisions: use Convex", summary: "### Architecture\nx", projectName: "acme" },
  );
  expect(context.contextPrompt).toContain("on this device the project is at /home/b/acme");
  expect(context.contextPrompt).toContain("Decisions: use Convex");
  expect(context.summary).toBe("### Architecture\nx");
  expect(uploadKey(context)).not.toBe(uploadKey({ ...context, summary: "other" }));
});
