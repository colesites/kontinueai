import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "@/components/view/plan/messages";
import type { KodeToolStep } from "./kode-agent";
import { remotePending, remoteRunView, runSignature } from "./kode-remote-snapshot";

const step = (patch: Partial<KodeToolStep>): KodeToolStep => ({
  id: "s1",
  name: "run_command",
  args: {},
  description: "bun test",
  state: "running",
  ...patch,
});

describe("remote run snapshot", () => {
  test("approvals carry the command or file", () => {
    expect(remotePending(step({ state: "pending-approval", args: { command: "bun test" } }))).toEqual({
      id: "s1",
      kind: "approval",
      title: "Kode wants to run a command",
      detail: "bun test",
    });
    expect(remotePending(step({ name: "edit_file", state: "pending-approval", args: { path: "src/app/login.ts" } }))?.title).toBe(
      "Kode wants to edit login.ts",
    );
  });

  test("questions keep their options, kinds and multi-question forms", () => {
    const single = remotePending(
      step({
        name: "ask_options",
        state: "pending-options",
        args: { question: "Which DB?", options: [{ value: "pg", label: "Postgres" }, { label: "SQLite" }], multiple: true },
      }),
    );
    expect(single?.questions).toEqual([
      { question: "Which DB?", kind: "multi", options: [{ value: "pg", label: "Postgres" }, { value: "SQLite", label: "SQLite" }] },
    ]);
    const form = remotePending(
      step({
        name: "ask_options",
        state: "pending-options",
        args: { questions: [{ question: "Name?", kind: "text" }, { question: "Ship it?", kind: "confirm" }] },
      }),
    );
    expect(form?.questions?.map((q) => q.kind)).toEqual(["text", "confirm"]);
    expect(form?.title).toBe("Name?");
  });

  test("status, live reply and signature", () => {
    const items = [
      { id: "u", role: "user", content: "Fix it", modelId: "kode-1" },
      { id: "a", role: "assistant", content: "Looking…", modelId: "kode-1", toolSteps: [step({ state: "done" })] },
    ] as ChatMessage[];
    const running = remoteRunView(items, true, []);
    expect(running.status).toBe("running");
    expect(running.text).toBe("Looking…");
    expect(running.steps).toEqual([{ id: "s1", name: "run_command", label: "bun test", state: "done" }]);
    const waiting = remoteRunView(items, true, [step({ id: "s2", state: "pending-approval", args: { command: "rm x" } })]);
    expect(waiting.status).toBe("awaiting");
    expect(runSignature(waiting)).not.toBe(runSignature(running));
    // The streaming text alone doesn't change the signature.
    expect(runSignature(remoteRunView([items[0]!, { ...items[1]!, content: "Looking… done" }], true, []))).toBe(runSignature(running));
    expect(remoteRunView(items, false, [])).toEqual({ status: "idle", text: "", steps: [], pending: [] });
  });
});
