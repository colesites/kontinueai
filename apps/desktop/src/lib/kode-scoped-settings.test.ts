import { describe, expect, test } from "bun:test";
import { resolveScoped, sanitizeScoped, scopeOf } from "./kode-scoped-settings";
import type { AppSettings } from "./app-settings";

const global = {
  sendOnEnter: true,
  showTurnNavigator: true,
  defaultKodeModel: null,
  defaultKodeMode: "supervised",
  textSize: "default",
  reduceMotion: false,
  kodeFastMode: false,
  kodeReasoning: "medium",
  kodeContextWindow: null,
  kodeProviders: [],
  kodeCliHealthInterval: 0,
} as unknown as AppSettings;

describe("scoped settings", () => {
  test("environment beats project beats global", () => {
    const effective = resolveScoped(global, { defaultKodeMode: "auto", kodeFastMode: true }, { defaultKodeMode: "plan" });
    expect(effective.defaultKodeMode).toBe("plan");
    expect(effective.kodeFastMode).toBe(true);
    expect(effective.kodeReasoning).toBe("medium");
    expect(scopeOf("defaultKodeMode", { defaultKodeMode: "auto" }, { defaultKodeMode: "plan" })).toBe("environment");
    expect(scopeOf("kodeFastMode", { kodeFastMode: true }, {})).toBe("project");
    expect(scopeOf("sendOnEnter")).toBe("global");
  });

  test("drops unknown keys and bad values from project files", () => {
    expect(sanitizeScoped({ defaultKodeMode: "yolo", kodeFastMode: "yes", textSize: "large", kodeContextWindow: 128000, kodeReasoning: "high" })).toEqual({
      kodeContextWindow: 128000,
      kodeReasoning: "high",
    });
    expect(sanitizeScoped(null)).toEqual({});
  });
});
