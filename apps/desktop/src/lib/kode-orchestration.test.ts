import { describe, expect, test } from "bun:test";
import { buildOrchestrationState, handoffPrompt, planInboxRequest } from "./kode-orchestration";

const folders = [{ id: "f1", name: "web", path: "/repo/web" }];
const chats = [
  { id: "c1", title: "Old", projectId: "f1", updatedAt: 1, pinnedAt: null, archived: false },
  { id: "c2", title: "New", projectId: null, updatedAt: 2, pinnedAt: null, archived: false, importSource: { provider: "codex", sessionId: "t", projectPath: "/repo/api", importedAt: 0 } },
];

describe("orchestration", () => {
  test("publishes threads newest first with their project", () => {
    const state = buildOrchestrationState(folders, chats, 9);
    expect(state.threads.map((t) => t.id)).toEqual(["c2", "c1"]);
    expect(state.threads[1].projectPath).toBe("/repo/web");
    expect(state.threads[0]).toMatchObject({ projectPath: "/repo/api", importedFrom: "codex" });
  });

  test("plans inbox requests", () => {
    expect(planInboxRequest({ id: "1", type: "start_thread", projectPath: "/r", prompt: "Add CI\nmore" }, chats)).toEqual({
      kind: "new_thread",
      projectPath: "/r",
      title: "Add CI",
      prompt: "Add CI\nmore",
    });
    expect(planInboxRequest({ id: "2", type: "message_thread", threadId: "c1", message: "hi" }, chats)).toEqual({ kind: "message", chatId: "c1", text: "hi" });
    expect(planInboxRequest({ id: "3", type: "message_thread", threadId: "zz", message: "hi" }, chats)).toBeNull();
    const handoff = planInboxRequest({ id: "4", type: "handoff", projectPath: "/r", summary: "Did X", nextStep: "Do Y", files: ["a.ts"] }, chats);
    expect(handoff?.kind).toBe("new_thread");
  });

  test("hand-off prompt carries summary, files and next step", () => {
    const text = handoffPrompt({ id: "x", type: "handoff", projectPath: "/r", summary: "Did X", nextStep: "Do Y", files: ["a.ts"] });
    expect(text).toContain("Did X");
    expect(text).toContain("- a.ts");
    expect(text).toContain("Next step: Do Y");
  });
});
