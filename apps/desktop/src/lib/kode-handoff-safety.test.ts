import { describe, expect, test } from "bun:test";
import { redactSecrets, scanSecrets, SECRET_MARK } from "./kode-secrets";
import { interruptedTurnNote, ledgerFromSteps, stepOutcome } from "./kode-tool-ledger";
import { buildHandoff } from "./kode-handoff";
import { buildContinuationBundle, unfinishedToolCalls, type CodingSession } from "./kode-import";
import { findRedactions } from "./kode-import-review";
import { decorateImportedMessage } from "./kode-import-sync";

describe("secrets in hand-offs", () => {
  test("finds tokens in terminal logs and removes them", () => {
    const log = [
      "$ npm publish",
      "npm ERR! //registry.npmjs.org/:_authToken=npm_abcdefghijklmnopqrstuvwxyz123456",
      "export STRIPE_SECRET_KEY=sk_" + "live_51HabcdefghijklmnopqrstUV",
      "curl -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'",
      "nothing secret here: version=1.2.3",
    ].join("\n");
    const found = scanSecrets(log);
    expect(found.length).toBeGreaterThanOrEqual(3);
    const { text, count } = redactSecrets(log);
    expect(count).toBe(found.length);
    expect(text).not.toContain("sk_live_51H");
    expect(text).not.toContain("eyJhbGciOiJIUzI1NiJ9.eyJ");
    expect(text).not.toContain("npm_abcdefghijklmnop");
    expect(text).toContain("version=1.2.3");
    expect(text).toContain(SECRET_MARK);
  });

  test("clean text is unchanged", () => {
    expect(redactSecrets("Refactor the auth module")).toEqual({ text: "Refactor the auth module", count: 0 });
  });
});

describe("unfinished tool calls", () => {
  test("a stopped turn's steps are split into completed, failed, unknown and not run", () => {
    const ledger = ledgerFromSteps([
      { id: "1", name: "write_file", args: {}, description: "src/gen.ts", state: "done", result: "ok" },
      { id: "2", name: "run_command", args: {}, description: "bun run codegen", state: "running" },
      { id: "3", name: "run_command", args: {}, description: "bun test", state: "error", result: "1 failing" },
      { id: "4", name: "delete_file", args: {}, description: "old.ts", state: "pending-approval" },
    ] as never);
    expect(ledger.map((s) => s.outcome)).toEqual(["completed", "unknown", "failed", "not_run"]);
    expect(stepOutcome({ state: "rejected" })).toBe("not_run");
    const note = interruptedTurnNote({ at: 1, model: "Claude Opus", reason: "usage limit", steps: ledger });
    expect(note).toContain("Completed (don't repeat these):\n- write_file: src/gen.ts");
    expect(note).toContain("Outcome unknown");
    expect(note).toContain("- run_command: bun run codegen");
    expect(note).toContain("Before re-running anything with an unknown outcome");
    expect(note).not.toContain("old.ts");
  });

  test("the hand-off carries the note", () => {
    const handoff = buildHandoff({ history: [{ role: "user", content: "Generate the client" }], interrupted: "## The previous turn did not finish\nUnknown: codegen" });
    expect(handoff.text).toContain("## The previous turn did not finish");
  });

  test("imported sessions flag calls from the last turn that never reported back", () => {
    const session: CodingSession = {
      provider: "claude_code", sessionId: "s", title: "t", projectPath: null, projectRoot: null, gitBranch: null, model: null,
      startedAt: 0, lastActivity: 0, sourcePath: "/x.jsonl",
      messages: [
        { role: "user", content: "Generate the API client", timestamp: 100 },
        { role: "assistant", content: "Running the generator now.", timestamp: 110 },
      ],
      toolEvents: [
        { name: "Bash", summary: "old", detail: "ls", timestamp: 50, id: "a" },
        { name: "Bash", summary: "bun run codegen", detail: "bun run codegen", timestamp: 111, id: "b" },
        { name: "Read", summary: "x.ts", detail: "x.ts", timestamp: 112, id: "c", hasResult: true },
      ],
      filesChanged: [], messagesDropped: 0, redactions: 0, truncated: false,
    };
    expect(unfinishedToolCalls(session).map((e) => e.id)).toEqual(["b"]);
    const prompt = buildContinuationBundle(session, null).contextPrompt;
    expect(prompt).toContain("### Tool calls with an unknown outcome");
    expect(prompt).toContain("- Bash: bun run codegen");
    expect(decorateImportedMessage(session.messages[1], [session.toolEvents[1]])).toContain('"unknown":true');
  });
});

test("redaction review lists secrets in tool output too", () => {
  const hits = findRedactions({
    messages: [{ role: "user", content: "deploy it", timestamp: 1 }],
    toolEvents: [{ name: "Bash", summary: "printenv", output: "TOKEN=[REDACTED_SECRET]", timestamp: 2 }],
    title: "Deploy",
  });
  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({ messageIndex: -1, role: "Bash output" });
});

test("history handed to another model loses its secrets, not its text", async () => {
  const { scrubHistory } = await import("./kode-secrets");
  const { history, count } = scrubHistory([
    { role: "user" as const, content: "here is the log: GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123" },
    { role: "assistant" as const, content: "Thanks, the build failed on step 3." },
  ]);
  expect(count).toBe(1);
  expect(history[0].content).toContain("here is the log:");
  expect(history[0].content).not.toContain("ghp_abcdef");
  expect(history[1].content).toBe("Thanks, the build failed on step 3.");
});

test("code that mentions tokens isn't treated as a secret", async () => {
  const { scanSecrets } = await import("./kode-secrets");
  expect(scanSecrets("const x = { token: ask.host }; secret = MAX_WEBHOOKS")).toHaveLength(0);
  expect(scanSecrets("API_KEY=abc123def456ghi789")).toHaveLength(1);
});
