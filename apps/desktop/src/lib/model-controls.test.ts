import { describe, expect, test } from "bun:test";
import { KODE_DEFAULT_MODEL_ID } from "@repo/ai/lib/kode";
import type { AppSettings, ProviderInstance } from "./app-settings";
import { getModelControls, levelInModelName, rememberModelWindow, resolveContextWindow } from "./model-controls";

const p = (id: string, kind: ProviderInstance["kind"], label: string) =>
  ({ id, kind, label, enabled: true, accent: null, builtIn: false, config: {}, variables: [], models: { disabled: [], custom: [] } }) as unknown as ProviderInstance;

const settings = {
  kodeProviders: [p("claude", "claude", "Claude Code"), p("codex", "codex", "Codex"), p("cursor", "cursor", "Cursor"), p("opencode", "acp", "OpenCode")],
  kodeActiveAccounts: {},
} as unknown as AppSettings;

describe("getModelControls", () => {
  test("Kode models offer their catalog efforts and context sizes", () => {
    const c = getModelControls(KODE_DEFAULT_MODEL_ID, settings);
    expect(c.efforts.length).toBeGreaterThan(0);
    expect(c.contextOptions.length).toBeGreaterThan(0);
    expect(c.kodeModel?.id).toBe(KODE_DEFAULT_MODEL_ID);
  });

  test("Claude Code gets low to max", () => {
    const c = getModelControls("cli:claude:claude-opus-5-5", settings, "Claude Opus 5.5");
    expect(c.efforts).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(c.contextOptions).toEqual([]);
  });

  test("Cursor and ACP agents choose themselves", () => {
    expect(getModelControls("cli:cursor:composer-2.5", settings, "Composer 2.5").efforts).toEqual([]);
    const acp = getModelControls("cli:opencode:opencode-go/gemini-4-argon", settings, "Gemini 4 Argon");
    expect(acp.efforts).toEqual([]);
    expect(acp.note).toContain("OpenCode");
  });

  test("a level in the model's name means no separate setting", () => {
    const c = getModelControls("cli:claude:claude-opus-5-thinking-high", settings, "Claude Opus 5 Thinking");
    expect(c.efforts).toEqual([]);
    expect(c.note).toContain("part of this model");
  });
});

describe("levelInModelName", () => {
  test("spots levels", () => {
    for (const name of ["Codex 5.3 High", "Grok 4.7 Low", "gpt-5.3-codex-xhigh", "Claude Opus 5 1M Thinking", "GPT-5.6 Sol 1M Extra High"]) {
      expect(levelInModelName(name)).toBe(true);
    }
  });
  test("leaves plain names alone", () => {
    for (const name of ["Claude Opus 5.5", "Gemini 4 Argon", "MiniMax M2", "claude-haiku-4-5", "Composer 2.5"]) {
      expect(levelInModelName(name)).toBe(false);
    }
  });
});

describe("resolveContextWindow", () => {
  test("uses what the agent reported", () => {
    rememberModelWindow("cli:claude:claude-test-model", 1_000_000);
    expect(resolveContextWindow("cli:claude:claude-test-model", { chosen: null, gateway: {} })).toBe(1_000_000);
  });
  test("matches the gateway catalog by name", () => {
    const gateway = { "acme/zephyr-9-pro": 2_000_000 };
    expect(resolveContextWindow("cli:opencode:opencode-go/zephyr-9-pro", { chosen: null, gateway, modelName: "Zephyr 9 Pro" })).toBe(2_000_000);
  });
  test("reads a size from the name", () => {
    expect(resolveContextWindow("cli:cursor:x", { chosen: null, gateway: {}, modelName: "GPT-5.6 Sol 1M High" })).toBe(1_000_000);
  });
  test("unknown stays unknown", () => {
    expect(resolveContextWindow("cli:opencode:mystery", { chosen: null, gateway: {}, modelName: "Mystery" })).toBeNull();
  });
});

test("a model Kode also offers uses Kode's catalog window", () => {
  expect(resolveContextWindow("cli:opencode:opencode-go/gemini-4-argon", { chosen: null, gateway: {}, modelName: "Gemini 4 Argon" })).toBeGreaterThan(128_000);
});
