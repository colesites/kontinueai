import { describe, expect, test } from "bun:test";
import { findPrUrls, prReadiness, sortByReadiness, summarizeChecks, type PullRequest } from "./kode-prs";

const base: PullRequest = {
  number: 1,
  title: "t",
  url: "https://github.com/o/r/pull/1",
  state: "OPEN",
  isDraft: false,
  headRefName: "feat",
  baseRefName: "main",
  updatedAt: "2026-11-01T00:00:00Z",
  reviewDecision: "",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  statusCheckRollup: [],
  additions: 1,
  deletions: 1,
};

describe("checks and readiness", () => {
  test("summarizes check runs and status contexts", () => {
    expect(
      summarizeChecks([
        { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
        { __typename: "CheckRun", status: "IN_PROGRESS" },
        { __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" },
        { __typename: "StatusContext", state: "SUCCESS" },
        { __typename: "StatusContext", state: "PENDING" },
      ]),
    ).toEqual({ passed: 2, failed: 1, pending: 2, total: 5 });
  });

  test("labels", () => {
    expect(prReadiness(base).label).toBe("Ready to merge");
    expect(prReadiness({ ...base, mergeable: "CONFLICTING" }).label).toBe("Conflicts");
    expect(prReadiness({ ...base, isDraft: true }).label).toBe("Draft");
    expect(prReadiness({ ...base, reviewDecision: "REVIEW_REQUIRED" }).label).toBe("Needs review");
    expect(
      prReadiness({ ...base, statusCheckRollup: [{ __typename: "StatusContext", state: "FAILURE" }] }).label,
    ).toBe("Checks failing");
    expect(prReadiness({ ...base, state: "MERGED" }).label).toBe("Merged");
  });

  test("sorts ready first", () => {
    const sorted = sortByReadiness([
      { ...base, number: 1, isDraft: true },
      { ...base, number: 2, mergeable: "CONFLICTING" },
      { ...base, number: 3 },
    ]);
    expect(sorted.map((pr) => pr.number)).toEqual([3, 2, 1]);
  });
});

test("finds PR urls", () => {
  expect(
    findPrUrls("Opened https://github.com/Owner/Repo/pull/12 and https://github.com/owner/repo/pull/12."),
  ).toEqual(["https://github.com/owner/repo/pull/12"]);
});

test("finds GitLab and Bitbucket PR links too", () => {
  expect(
    findPrUrls("See https://gitlab.com/g/sub/r/-/merge_requests/7 and https://bitbucket.org/w/r/pull-requests/3, plus https://git.acme.dev/team/app/-/merge_requests/2."),
  ).toEqual([
    "https://gitlab.com/g/sub/r/-/merge_requests/7",
    "https://bitbucket.org/w/r/pull-requests/3",
    "https://git.acme.dev/team/app/-/merge_requests/2",
  ]);
});
