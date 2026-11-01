import { describe, expect, test } from "bun:test";

import {
  buildContinuationBundle,
  diffSessionMessages,
  hashMessageContent,
  type CodingProjectState,
  type CodingSession,
} from "./kode-import";

const session: CodingSession = {
  provider: "claude_code",
  sessionId: "sess-1",
  title: "Fix auth",
  projectPath: "/tmp/project",
  projectRoot: "/tmp/project",
  gitBranch: "main",
  model: "claude-x",
  startedAt: 1_767_225_600_000,
  lastActivity: 1_767_225_720_000,
  sourcePath: "/tmp/session.jsonl",
  messages: [
    { role: "user", content: "Fix the login flow", timestamp: 1_767_225_600_000 },
    {
      role: "assistant",
      content: "I inspected the auth middleware.",
      timestamp: 1_767_225_660_000,
    },
    {
      role: "user",
      content: "Use Convex for persistence and never change the API contract.",
      timestamp: 1_767_225_690_000,
    },
    {
      role: "user",
      content: "Also add a regression test",
      timestamp: 1_767_225_720_000,
    },
  ],
  toolEvents: [
    { name: "Edit", summary: "src/auth.ts", timestamp: 1_767_225_660_000 },
    {
      name: "tool error",
      summary: "TypeError: cannot read properties of undefined",
      timestamp: 1_767_225_700_000,
    },
  ],
  filesChanged: ["src/auth.ts"],
  messagesDropped: 2,
  redactions: 1,
  truncated: true,
};

const project: CodingProjectState = {
  root: "/tmp/project",
  branch: "feature/auth",
  status: "## feature/auth\n M src/auth.ts",
  diffStat: "src/auth.ts | 4 ++--",
  recentCommits: ["abc123 Fix auth"],
  changedFiles: ["src/auth.ts"],
  instructions: [
    {
      path: "AGENTS.md",
      content: "Use Convex for persistence.",
      truncated: false,
    },
  ],
  scripts: ["dev: vite", "test: bun test"],
};

describe("buildContinuationBundle", () => {
  test("assembles the task, conversation tail, project state, and rules", () => {
    const bundle = buildContinuationBundle(session, project);

    expect(bundle.lastTask).toBe("Also add a regression test");
    expect(bundle.conversationFound).toBe(true);
    expect(bundle.projectFound).toBe(true);
    expect(bundle.providerLabel).toBe("Claude Code");

    const prompt = bundle.contextPrompt;
    expect(prompt).toContain("CONTINUATION CONTEXT");
    expect(prompt).toContain("Fix auth");
    expect(prompt).toContain("Also add a regression test");
    expect(prompt).toContain("Files the previous session touched");
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).toContain("Changed files: 1");
    expect(prompt).toContain("Recent commits:");
    expect(prompt).toContain("dev: vite");
    expect(prompt).toContain("Project instructions");
    expect(prompt).toContain("Use Convex for persistence.");
    expect(prompt).toContain("2 older messages were omitted");
    expect(prompt).toContain("Rules for continuing");

    expect(bundle.memory.decisions).toContain(
      "Use Convex for persistence and never change the API contract.",
    );
    expect(
      bundle.memory.knownIssues.some((issue) => issue.includes("TypeError")),
    ).toBe(true);
    expect(bundle.memory.touchedAreas).toContain("src/auth.ts");
    expect(prompt).toContain("Project memory");
    expect(prompt).toContain("Decisions and constraints");
    expect(prompt).toContain("TypeError");
  });

  test("ignores system notices when choosing the latest task", () => {
    const withNotice: CodingSession = {
      ...session,
      messages: [
        ...session.messages,
        {
          role: "system",
          content: "You've hit your weekly limit",
          timestamp: 1_767_225_780_000,
        },
      ],
    };

    const bundle = buildContinuationBundle(withNotice, project);

    expect(bundle.lastTask).toBe("Also add a regression test");
    expect(bundle.session.messages.at(-1)?.role).toBe("system");
  });

  test("warns when the project folder could not be inspected", () => {
    const bundle = buildContinuationBundle(session, null);

    expect(bundle.projectFound).toBe(false);
    expect(bundle.contextPrompt).toContain("could not be inspected");
  });
});

describe("session sync diff", () => {
  test("returns only the turns appended since the last import", () => {
    const importedCount = 3;
    const importedHash = hashMessageContent(session.messages[2]!.content);

    const diff = diffSessionMessages(session, importedCount, importedHash);

    expect(diff.newMessages).toHaveLength(1);
    expect(diff.newMessages[0]?.content).toBe("Also add a regression test");
    expect(diff.messageCount).toBe(4);
    expect(diff.lastMessageHash).toBe(
      hashMessageContent("Also add a regression test"),
    );
  });

  test("rejects a transcript whose imported prefix changed", () => {
    const importedHash = hashMessageContent(
      "A completely different message",
    );

    expect(() => diffSessionMessages(session, 3, importedHash)).toThrow(
      /cannot be appended safely/i,
    );
  });

  test("rejects a shrunk transcript and legacy imports without a hash", () => {
    expect(() => diffSessionMessages(session, 99, undefined)).toThrow(
      /fewer messages/i,
    );
    expect(() => diffSessionMessages(session, 2, undefined)).toThrow(
      /Re-import the session/i,
    );
  });
});
