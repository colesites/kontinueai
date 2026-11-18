import { describe, expect, test } from "bun:test";
import {
  contextTokensFor,
  formatContextPercent,
  getChatContextUsage,
  recordChatContextUsage,
  rememberChatContextEstimate,
} from "./kode-context-usage";

const usageOf = (totalTokens: number) =>
  ({ inputTokens: totalTokens, outputTokens: 0, totalTokens }) as Parameters<
    typeof recordChatContextUsage
  >[1];

describe("chat context meter", () => {
  test("a CLI agent's own count survives the saved-text estimate", () => {
    // Claude Code reports its whole session (tool output, files, system prompt).
    recordChatContextUsage("chat-cli", usageOf(640_000), "cli");
    // The persisted text alone is tiny; it must not replace the real count.
    rememberChatContextEstimate("chat-cli", 13_000);
    expect(contextTokensFor(getChatContextUsage("chat-cli"), "cli")).toBe(640_000);
  });

  test("a count from the other route falls back to the estimate", () => {
    recordChatContextUsage("chat-switch", usageOf(500_000), "cli");
    rememberChatContextEstimate("chat-switch", 20_000);
    // Switched to an in-app model: it sends Kontinue's history, not the CLI session.
    expect(contextTokensFor(getChatContextUsage("chat-switch"), "api")).toBe(20_000);
  });

  test("ignores empty reports", () => {
    rememberChatContextEstimate("chat-empty", 4_000);
    recordChatContextUsage("chat-empty", usageOf(0), "cli");
    expect(contextTokensFor(getChatContextUsage("chat-empty"), "cli")).toBe(4_000);
  });

  test("footer and popover share one percentage format", () => {
    expect(formatContextPercent(13_000, 1_000_000)).toBe("1.3%");
    expect(formatContextPercent(640_000, 1_000_000)).toBe("64%");
    expect(formatContextPercent(0, 0)).toBe("0%");
  });
});
