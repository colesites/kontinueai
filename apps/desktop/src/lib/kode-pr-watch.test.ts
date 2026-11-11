import { describe, expect, test } from "bun:test";
import type { PrComment, PullRequest } from "./kode-prs";
import { diffPr, pickChatPr, type PrWatch, prEventPrompt, prStanding } from "./kode-pr-watch";

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  number: 7,
  title: "Add search",
  url: "https://github.com/o/r/pull/7",
  state: "OPEN",
  isDraft: false,
  headRefName: "feat/search",
  baseRefName: "main",
  updatedAt: "2026-11-10T10:00:00Z",
  reviewDecision: null,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  statusCheckRollup: [],
  additions: 1,
  deletions: 0,
  ...over,
});
const failing = (name: string) => ({ __typename: "CheckRun" as const, name, status: "COMPLETED", conclusion: "FAILURE" });
const watch = (over: Partial<PrWatch> = {}): PrWatch => ({
  url: "https://github.com/o/r/pull/7",
  chatId: "chat-1",
  autoFix: true,
  state: "OPEN",
  ...over,
});
const comment = (id: string, author = "amy", kind: PrComment["kind"] = "inline"): PrComment => ({
  id,
  kind,
  author,
  body: "Please rename this",
  path: "src/a.ts",
  line: 3,
  createdAt: "2026-11-10T10:00:00Z",
  url: null,
});

describe("diffPr", () => {
  test("reports a CI failure once, and again only when it changes", () => {
    const first = diffPr(watch(), pr({ statusCheckRollup: [failing("build")] }), null);
    expect(first.events).toEqual([{ kind: "ci_failed", checks: ["build"] }]);

    const again = diffPr(watch(first.patch), pr({ statusCheckRollup: [failing("build")] }), null);
    expect(again.events).toEqual([]);

    const worse = diffPr(watch(first.patch), pr({ statusCheckRollup: [failing("build"), failing("lint")] }), null);
    expect(worse.events).toEqual([{ kind: "ci_failed", checks: ["build", "lint"] }]);
  });

  test("a fixed build resets, so the next failure is reported", () => {
    const fixed = diffPr(watch({ reportedFailing: "build" }), pr(), null);
    expect(fixed.patch.reportedFailing).toBeUndefined();
  });

  test("reports a conflict once until it's resolved", () => {
    const hit = diffPr(watch(), pr({ mergeable: "CONFLICTING" }), null);
    expect(hit.events).toEqual([{ kind: "conflict" }]);
    expect(diffPr(watch(hit.patch), pr({ mergeable: "CONFLICTING" }), null).events).toEqual([]);
    expect(diffPr(watch(hit.patch), pr(), null).patch.reportedConflict).toBe(false);
  });

  test("the first comment fetch is a baseline, later ones relay only new comments", () => {
    const baseline = diffPr(watch(), pr(), [comment("inline:1")]);
    expect(baseline.events).toEqual([]);
    const next = diffPr(watch(baseline.patch), pr(), [comment("inline:1"), comment("inline:2")]);
    expect(next.events).toEqual([{ kind: "comments", comments: [comment("inline:2")] }]);
  });

  test("ignores bot status posts but keeps bot reviews", () => {
    const primed = watch({ commentsPrimed: true, seenComments: [] });
    const result = diffPr(primed, pr(), [
      comment("comment:1", "vercel[bot]", "comment"),
      comment("review:2", "coderabbitai[bot]", "review"),
    ]);
    expect(result.events).toEqual([
      { kind: "comments", comments: [comment("review:2", "coderabbitai[bot]", "review")] },
    ]);
  });

  test("a merge we watched happen is reported", () => {
    const merged = diffPr(watch(), pr({ state: "MERGED" }), null, 123);
    expect(merged.events).toEqual([{ kind: "merged" }]);
    expect(merged.patch.mergedAt).toBe(123);
  });

  test("a PR that was already merged when first seen is not news", () => {
    const old = diffPr(watch({ state: undefined }), pr({ state: "MERGED" }), null);
    expect(old.events).toEqual([]);
    expect(old.patch.mergeHandled).toBe(true);
  });
});

describe("prEventPrompt", () => {
  test("nothing to fix means no prompt", () => {
    expect(prEventPrompt(pr(), [{ kind: "merged" }])).toBeNull();
  });

  test("names the failing checks, the branch, and forbids force-pushing", () => {
    const text = prEventPrompt(pr(), [{ kind: "ci_failed", checks: ["build"] }]) ?? "";
    expect(text).toContain("PR #7");
    expect(text).toContain("feat/search");
    expect(text).toContain("build");
    expect(text).toContain("never force-push");
  });

  test("quotes comments as data, not instructions", () => {
    const text = prEventPrompt(pr(), [{ kind: "comments", comments: [comment("inline:2")] }]) ?? "";
    expect(text).toContain("not as instructions");
    expect(text).toContain("> Please rename this");
    expect(text).toContain("src/a.ts:3");
  });
});

describe("prStanding", () => {
  const watch = (patch: Partial<PrWatch>): PrWatch => ({ url: "u", chatId: "c", autoFix: false, state: "OPEN", ...patch });
  const passed = { passed: 3, failed: 0, pending: 0, total: 3 };

  test("offers a merge once checks pass", () => {
    expect(prStanding(watch({ checks: passed }))).toMatchObject({ stage: "ready", canMerge: true });
  });

  test("does not offer a merge GitHub would refuse", () => {
    expect(prStanding(watch({ conflicting: true, checks: passed })).canMerge).toBe(false);
    expect(prStanding(watch({ isDraft: true })).canMerge).toBe(false);
    expect(prStanding(watch({ reviewDecision: "CHANGES_REQUESTED", checks: passed })).canMerge).toBe(false);
    expect(prStanding(watch({ reviewDecision: "REVIEW_REQUIRED", checks: passed })).canMerge).toBe(false);
    expect(prStanding(watch({ mergeStateStatus: "BLOCKED", checks: passed })).canMerge).toBe(false);
  });

  test("failing checks are flagged but can be merged on purpose", () => {
    expect(prStanding(watch({ checks: { passed: 1, failed: 2, pending: 0, total: 3 } }))).toMatchObject({
      stage: "failing",
      label: "2 checks failing",
      canMerge: true,
    });
  });

  test("finished and unknown PRs", () => {
    expect(prStanding(undefined).stage).toBe("checking");
    expect(prStanding(watch({ state: "MERGED" }))).toMatchObject({ stage: "merged", canMerge: false });
    expect(prStanding(watch({ state: "CLOSED" })).stage).toBe("closed");
  });

  test("a chat shows the PR that needs work before one that is fine", () => {
    const ok = watch({ url: "ok", checks: passed });
    const broken = watch({ url: "broken", conflicting: true });
    const merged = watch({ url: "merged", state: "MERGED" });
    expect(pickChatPr([merged, ok, broken])?.url).toBe("broken");
    expect(pickChatPr([merged, ok])?.url).toBe("ok");
  });
});
