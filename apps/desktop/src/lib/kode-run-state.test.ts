import { describe, expect, test } from "bun:test";
import { createRunSlot } from "./kode-run-state";

describe("createRunSlot", () => {
  test("keeps writes made after the view that started them is gone", () => {
    const slot = createRunSlot<Record<string, string[]>>({});
    // A running turn holds the setter; the component that rendered it unmounts.
    const setFromRun = slot.set;
    let seen = 0;
    const unsubscribe = slot.subscribe(() => {
      seen += 1;
    });
    unsubscribe();
    setFromRun((current) => ({ ...current, chat1: ["user", "assistant"] }));
    setFromRun((current) => ({ ...current, chat1: [...current.chat1, "step"] }));
    // A view mounted later reads the live value.
    expect(slot.get().chat1).toEqual(["user", "assistant", "step"]);
    expect(seen).toBe(0);
  });

  test("notifies subscribers and skips no-op updates", () => {
    const slot = createRunSlot({ a: false });
    let calls = 0;
    slot.subscribe(() => {
      calls += 1;
    });
    slot.set((current) => current);
    slot.set({ a: true });
    expect(calls).toBe(1);
  });
});
