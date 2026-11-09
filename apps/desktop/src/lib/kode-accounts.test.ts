import { describe, expect, test } from "bun:test";
import { accountGroups, accountKey, activeAccountId, codexThreadBelongsTo, isActiveAccount, modelOnAccount, nativeSessionBelongsTo, resolveSwitchTarget } from "./kode-accounts";
import type { ProviderInstance } from "./app-settings";

const p = (id: string, kind: ProviderInstance["kind"], label: string, enabled = true, preset?: ProviderInstance["preset"]) =>
  ({ id, kind, preset, label, enabled, accent: null, builtIn: false, config: {}, variables: [], models: { disabled: [], custom: [] } }) as unknown as ProviderInstance;

const providers = [
  p("claude", "claude", "Claude Code"),
  p("claude-work", "claude", "Claude (work)"),
  p("claude-old", "claude", "Old Claude", false),
  p("codex", "codex", "Codex"),
  p("gemini", "acp", "Gemini", true, "gemini"),
  p("my-agent", "acp", "Mine", true, "custom"),
  p("other-agent", "acp", "Other", true, "custom"),
];

describe("accounts", () => {
  test("groups providers with several accounts", () => {
    const groups = accountGroups({ kodeProviders: providers, kodeActiveAccounts: {} });
    expect(groups.map((g) => g.key)).toEqual(["claude"]);
    expect(groups[0].activeId).toBe("claude");
    expect(accountKey(providers[4])).toBe("acp:gemini");
  });

  test("active account: saved choice if enabled, else first enabled", () => {
    expect(activeAccountId("claude", providers, { claude: "claude-work" })).toBe("claude-work");
    expect(activeAccountId("claude", providers, { claude: "claude-old" })).toBe("claude");
    const settings = { kodeProviders: providers, kodeActiveAccounts: { claude: "claude-work" } };
    expect(isActiveAccount(providers[0], settings)).toBe(false);
    expect(isActiveAccount(providers[1], settings)).toBe(true);
    expect(isActiveAccount(providers[5], settings)).toBe(true); // custom agents aren't accounts
  });

  test("/switch targets", () => {
    const group = accountGroups({ kodeProviders: providers, kodeActiveAccounts: {} })[0];
    expect(resolveSwitchTarget(group, "claude", "")?.id).toBe("claude-work");
    expect(resolveSwitchTarget(group, "claude-work", "")?.id).toBe("claude");
    expect(resolveSwitchTarget(group, "claude", "work")?.id).toBe("claude-work");
    expect(resolveSwitchTarget(group, "claude", "old")).toBeNull(); // disabled
    expect(modelOnAccount("cli:claude:claude-opus-5-5", "claude-work")).toBe("cli:claude-work:claude-opus-5-5");
    expect(modelOnAccount("kontinue/kode-1.0", "claude-work")).toBeNull();
  });
});

test("/switch-<account> commands", async () => {
  const { switchCommandName, slashEntries } = await import("./kode-commands");
  expect(switchCommandName("claude_work")).toBe("switch-claude-work");
  const names = slashEntries([], [], [], [{ id: "claude-work", label: "Claude (work)", provider: "Claude Code" }]).map((e) => e.name);
  expect(names).toContain("switch");
  expect(names).toContain("switch-claude-work");
  expect(slashEntries([]).map((e) => e.name)).toContain("switch");
  expect(slashEntries([]).map((e) => e.name).some((n) => n.startsWith("switch-"))).toBe(false);
  const group = accountGroups({ kodeProviders: providers, kodeActiveAccounts: {} })[0];
  expect(resolveSwitchTarget(group, "claude", "claude-work")?.id).toBe("claude-work");
});

test("codex threads resume on the account that owns them", () => {
  const codex = { kind: "codex" as const, config: { homeDir: "" } } as never;
  const work = { kind: "codex" as const, config: { homeDir: "~/codex-work" } } as never;
  const path = "/Users/a/.codex/sessions/2026/11/01/rollout-x.jsonl";
  expect(codexThreadBelongsTo(path, codex)).toBe(true);
  expect(codexThreadBelongsTo(path, work, "/Users/a")).toBe(false);
  expect(codexThreadBelongsTo("/Users/a/codex-work/sessions/r.jsonl", work, "/Users/a")).toBe(true);
  expect(codexThreadBelongsTo(path, { kind: "claude", config: { homeDir: "" } } as never)).toBe(false);
});

test("a Claude Code session belongs to the account whose config folder holds it", () => {
  const claude = { kind: "claude", config: { homeDir: "" } } as never;
  const work = { kind: "claude", config: { homeDir: "~/claude-work" } } as never;
  const path = "/Users/a/.claude/projects/-Users-a-app/123.jsonl";
  expect(nativeSessionBelongsTo("claude_code", path, claude)).toBe(true);
  expect(nativeSessionBelongsTo("claude_code", path, work, "/Users/a")).toBe(false);
  expect(nativeSessionBelongsTo("claude_code", "/Users/a/claude-work/projects/x/1.jsonl", work, "/Users/a")).toBe(true);
  expect(nativeSessionBelongsTo("cursor", path, claude)).toBe(false);
  expect(nativeSessionBelongsTo("codex", "/Users/a/.codex/sessions/r.jsonl", { kind: "codex", config: { homeDir: "" } } as never)).toBe(true);
});
