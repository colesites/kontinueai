import { beforeEach, describe, expect, mock, test } from "bun:test";

let prs: { url: string; state: string; headRefName: string; updatedAt: string }[] = [];
const calls: string[] = [];
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (command: string) => {
    calls.push(command);
    if (command === "panel_git_status") return { branch: "feat/search", remoteUrl: "git@github.com:o/r.git" };
    if (command === "panel_pr_list") return prs;
    throw new Error(`unexpected ${command}`);
  },
}));

const { getPrThreads, linkTurnPrs, repoOfPrUrl, repoOfRemote } = await import("./kode-prs");

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
    await linkTurnPrs("chat-cli", "Claude chat", "/repo", [step]);
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

  test("a PR link that was only read or quoted isn't this chat's PR", async () => {
    const read = { args: { command: "cat notes.md" }, result: "see https://github.com/o/r/pull/50" };
    await linkTurnPrs("chat-reader", "Reader", "/repo", [read], "Look at https://github.com/o/r/pull/50");
    expect(getPrThreads()["https://github.com/o/r/pull/50"]).toBeUndefined();
    expect(calls).toEqual([]);
  });

  test("a PR in another repo is never linked", async () => {
    const step = { args: { command: "git push && gh pr create --fill" }, result: "https://github.com/other/repo/pull/7" };
    await linkTurnPrs("chat-other", "Other", "/repo", [step]);
    expect(getPrThreads()["https://github.com/other/repo/pull/7"]).toBeUndefined();
  });
});

describe("repo matching", () => {
  test("remotes and PR URLs map to the same repo key", () => {
    expect(repoOfRemote("git@github.com:Colesites/Kontinueai.git")).toBe("github.com/colesites/kontinueai");
    expect(repoOfRemote("https://github.com/colesites/kontinueai")).toBe("github.com/colesites/kontinueai");
    expect(repoOfRemote("ssh://git@gitlab.com/group/sub/repo.git")).toBe("gitlab.com/group/sub/repo");
    expect(repoOfPrUrl("https://github.com/colesites/kontinueai/pull/22")).toBe("github.com/colesites/kontinueai");
    expect(repoOfPrUrl("https://gitlab.com/group/sub/repo/-/merge_requests/4")).toBe("gitlab.com/group/sub/repo");
    expect(repoOfPrUrl("https://bitbucket.org/ws/repo/pull-requests/9")).toBe("bitbucket.org/ws/repo");
  });
});
