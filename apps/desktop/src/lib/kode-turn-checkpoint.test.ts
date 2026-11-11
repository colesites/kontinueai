import { beforeEach, describe, expect, test } from "bun:test";

const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
} as Storage;

const { clearCheckpoint, leftoverCheckpoints, writeCheckpoint } = await import("./kode-turn-checkpoint");

describe("turn checkpoints", () => {
  beforeEach(() => memory.clear());

  test("keep the latest reply per chat and survive until cleared", () => {
    writeCheckpoint({ chatId: "a", reply: "first", at: 1 });
    writeCheckpoint({ chatId: "a", reply: "first and more", at: 2 });
    writeCheckpoint({ chatId: "b", reply: "other", at: 3 });
    expect(leftoverCheckpoints(() => false).map((c) => [c.chatId, c.reply])).toEqual([
      ["a", "first and more"],
      ["b", "other"],
    ]);
    clearCheckpoint("a");
    expect(leftoverCheckpoints(() => false).map((c) => c.chatId)).toEqual(["b"]);
  });

  test("skip chats that are still running", () => {
    writeCheckpoint({ chatId: "a", reply: "x", at: 1 });
    expect(leftoverCheckpoints((id) => id === "a")).toEqual([]);
  });

  test("clearing the last one removes the key", () => {
    writeCheckpoint({ chatId: "a", reply: "x", at: 1 });
    clearCheckpoint("a");
    expect(memory.size).toBe(0);
  });
});
