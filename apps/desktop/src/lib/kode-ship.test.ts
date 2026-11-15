import { describe, expect, test } from "bun:test";
import { branchSlug, changedFiles, fallbackDraft, isDefaultBranch, parseDraft } from "./kode-ship";

describe("kode-ship", () => {
  test("branch names from a title", () => {
    expect(branchSlug("Fix the login redirect!")).toBe("kontinue/fix-the-login-redirect");
    expect(branchSlug("")).toBe("kontinue/changes");
    expect(branchSlug("Improve the 3D city so it looks like an actual city with roads")).toBe("kontinue/improve-the-3d-city-so-it");
  });

  test("changed files from git status, renames use the new path", () => {
    expect(changedFiles(" M src/a.ts\n?? new.txt\nR  old.ts -> moved.ts\n")).toEqual(["src/a.ts", "new.txt", "moved.ts"]);
  });

  test("draft without a model", () => {
    const draft = fallbackDraft({ status: " M src/a.ts\n", commits: "" }, "Make the map 3D");
    expect(draft.branch).toBe("kontinue/make-the-map-3d");
    expect(draft.title).toBe("Make the map 3D");
    expect(draft.body).toContain("`src/a.ts`");
    expect(fallbackDraft({ status: " M a\n M b\n", commits: "" }, null).title).toBe("Update 2 files");
  });

  test("model reply fills the draft and bad fields keep the fallback", () => {
    const fallback = fallbackDraft({ status: " M a\n", commits: "" }, "x");
    const reply = 'Sure:\n{"branch":"kontinue/real-city","commitMessage":"Build real streets","title":"Real city","body":"Adds streets"}';
    expect(parseDraft(reply, fallback)).toEqual({ branch: "kontinue/real-city", commitMessage: "Build real streets", title: "Real city", body: "Adds streets" });
    expect(parseDraft('{"branch":"--force; rm"}', fallback).branch).toBe(fallback.branch);
    expect(parseDraft("not json", fallback)).toEqual(fallback);
  });

  test("default branch detection", () => {
    expect(isDefaultBranch("main", null)).toBe(true);
    expect(isDefaultBranch("develop", "develop")).toBe(true);
    expect(isDefaultBranch("kontinue/x", "main")).toBe(false);
    expect(isDefaultBranch(null, "main")).toBe(true);
  });
});
