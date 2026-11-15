import { describe, expect, test } from "bun:test";
import { isAccountStartupReady } from "./startup-readiness";

const ready = {
  isConvexAuthenticated: true,
  plan: "pro" as const,
  usagePlan: "pro" as const,
  synced: true,
};

describe("signed-in startup readiness", () => {
  test("waits for authentication, plan resolution, sync and matching usage", () => {
    expect(isAccountStartupReady({ ...ready, isConvexAuthenticated: false })).toBe(false);
    expect(isAccountStartupReady({ ...ready, plan: null })).toBe(false);
    expect(isAccountStartupReady({ ...ready, synced: false })).toBe(false);
    expect(isAccountStartupReady({ ...ready, usagePlan: undefined })).toBe(false);
    expect(isAccountStartupReady({ ...ready, usagePlan: null })).toBe(false);
    expect(isAccountStartupReady({ ...ready, usagePlan: "free" })).toBe(false);
    expect(isAccountStartupReady(ready)).toBe(true);
  });

  test("allows a synced new free account after usage loads", () => {
    expect(isAccountStartupReady({ ...ready, plan: "free", usagePlan: "free" })).toBe(true);
  });
});
