import { beforeEach, describe, expect, mock, test } from "bun:test";

let prs: { url: string; state: string; headRefName: string; updatedAt: string }[] = [];
const calls: string[] = [];
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (command: string) => {
    calls.push(command);
    if (command === "panel_git_status") return { branch: "feat/search" };
    if (command === "panel_pr_list") return prs;
    throw new Error(`unexpected ${command}`);
  },
}));

const { getPrThreads, linkTurnPrs } = await import("./kode-prs");

describe("linkTurnPrs", () => {
  beforeEach(() => {
    prs = [];
    calls.length = 0;
  });

  test("finds a PR URL printed after git push's own output", async () => {
    const pushNoise = "remote: Resolving deltas: 100% (3/3)\n".repeat(40);
    const step = {
      args: { command: "git push -u origin feat/a && gh pr create --fill" },
      result: `${pushNoise}https://github.com/o/r/pull/41\n`,
    };
    await linkTurnPrs("chat-cli", "Claude chat", null, [step]);
    expect(getPrThreads()["https://github.com/o/r/pull/41"]?.chatId).toBe("chat-cli");
  });

  test("a push to a branch with an open PR links that PR", async () => {
    prs = [{ url: "https://github.com/o/r/pull/42", state: "OPEN", headRefName: "feat/search", updatedAt: "2020-01-01T00:00:00Z" }];
    await linkTurnPrs("chat-codex", "Codex chat", "/repo", [{ args: { command: "git push" }, result: "Everything up-to-date" }]);
    expect(getPrThreads()["https://github.com/o/r/pull/42"]?.chatId).toBe("chat-codex");
  });

  test("an old merged PR on a reused branch name is not linked", async () => {
    prs = [{ url: "https://github.com/o/r/pull/43", state: "MERGED", headRefName: "feat/search", updatedAt: "2020-01-01T00:00:00Z" }];
    await linkTurnPrs("chat-old", "Old", "/repo", [{ args: { command: "git push" } }]);
    expect(getPrThreads()["https://github.com/o/r/pull/43"]).toBeUndefined();
  });

  test("turns that didn't push don't ask GitHub", async () => {
    await linkTurnPrs("chat-read", "Reading", "/repo", [{ args: { command: "git status" }, result: "clean" }]);
    expect(calls).toEqual([]);
  });
});
