import { describe, expect, test } from "bun:test";
import { getDraft, getDraftChips, setDraft, setDraftChips } from "./kode-drafts";

describe("composer drafts", () => {
  test("each thread keeps its own text, attachments and chips", () => {
    setDraft("kode:a", "half a thought", [{ id: "f1" }]);
    setDraftChips("kode:a", [{ name: "review" }]);
    setDraft("kode:b", "another", []);
    expect(getDraft("kode:a")).toEqual({ text: "half a thought", attachments: [{ id: "f1" }] });
    expect(getDraft("kode:b")).toEqual({ text: "another", attachments: [] });
    expect(getDraftChips("kode:a")).toEqual([{ name: "review" }]);
    expect(getDraftChips("kode:b")).toEqual([]);
    expect(getDraft("kode:new:none").text).toBe("");
  });

  test("sending (an empty draft) clears it", () => {
    setDraft("kode:c", "send me", [{ id: "x" }]);
    setDraft("kode:c", "", []);
    expect(getDraft("kode:c")).toEqual({ text: "", attachments: [] });
  });
});
