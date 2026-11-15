import { afterEach, describe, expect, test } from "bun:test";
import { readOfflinePlan, readOfflineValue, writeOfflineValue } from "./offline-state";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } satisfies Storage;
}
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("offline display preferences", () => {
  test("preserves plans and selected models independently per account", () => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage() });
    writeOfflineValue("user-a", "plan", "pro");
    writeOfflineValue("user-a", "kode-model", "cli:claude:opus");
    writeOfflineValue("user-b", "plan", "free");
    expect(readOfflinePlan("user-a")).toBe("pro");
    expect(readOfflinePlan("user-b")).toBe("free");
    expect(readOfflinePlan(null)).toBeNull();
    expect(readOfflineValue("user-b", "kode-model")).toBeNull();
    expect(readOfflineValue("user-a", "kode-model")).toBe("cli:claude:opus");
  });
  test("rejects invalid plans and handles unavailable storage", () => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage() });
    writeOfflineValue("user", "plan", "invalid");
    expect(readOfflinePlan("user")).toBeNull();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("unavailable"); } });
    expect(readOfflinePlan("user")).toBeNull();
    expect(() => writeOfflineValue("user", "plan", "pro")).not.toThrow();
  });
});
