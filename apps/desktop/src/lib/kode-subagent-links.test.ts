import { describe, expect, test } from "bun:test";
import {
  isLegacySubagentFolder,
  legacySubagentModel,
  worktreeRepoName,
} from "./kode-subagent-links";

const base = "/Users/me/.kontinue/worktrees/kontinueai";

describe("sub-agent worktrees", () => {
  test("recognises fan-out worktrees from before links were saved", () => {
    expect(
      isLegacySubagentFolder(`${base}/kode-read-only-analysis-task-grok-4-7-high-fast-g6931`, [
        "READ-ONLY ANALYSIS TASK",
      ]),
    ).toBe(true);
    expect(
      isLegacySubagentFolder(`${base}/kode-you-previously-audited-a-kode-1-0-pzwp0`, [
        "You previously audited",
      ]),
    ).toBe(true);
  });

  test("leaves 'New worktree' threads and hand-made branches alone", () => {
    // Thread branches end with exactly four characters.
    expect(isLegacySubagentFolder(`${base}/kode-fix-login-bug-a1b2`, ["Fix login bug"])).toBe(false);
    // A stamped folder whose chat is about something else (moved in later).
    expect(isLegacySubagentFolder(`${base}/kode-task-model-abcd1`, ["Fix the login bug"])).toBe(false);
    // Not a Kode worktree at all.
    expect(isLegacySubagentFolder("/Users/me/code/app-abcd1", ["App"])).toBe(false);
  });

  test("recovers the model name from the branch", () => {
    expect(
      legacySubagentModel(
        `${base}/kode-read-only-analysis-task-grok-4-7-high-fast-g6931`,
        "READ-ONLY ANALYSIS TASK",
      ),
    ).toBe("Grok 4 7 High Fast");
  });

  test("finds the repo a worktree came from", () => {
    expect(worktreeRepoName(`${base}/kode-task-x-abcd1`)).toBe("kontinueai");
  });
});
