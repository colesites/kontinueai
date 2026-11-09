import { expect, test } from "bun:test";
import { snapshotPrompt } from "./kode-snapshot";

test("snapshot prompt carries the ask, place, tree and notes", () => {
  const text = snapshotPrompt(
    { image: null, app: "Safari", window: "Checkout", tree: "Button \"Pay\"\n", notes: ["Screen capture failed."], takenAt: 0 },
    "Why is Pay disabled?",
    ".kode/attachments/1-snapshot.png",
  );
  expect(text.startsWith("Why is Pay disabled?")).toBe(true);
  expect(text).toContain("Snapshot of Safari · Checkout");
  expect(text).toContain("Button \"Pay\"");
  expect(text).toContain(".kode/attachments/1-snapshot.png");
  expect(text).toContain("Note: Screen capture failed.");
});
