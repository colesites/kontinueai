import { describe, expect, test } from "bun:test";
import { cleanLimitMarker, detectLimit, formatCountdown, parseResetTime } from "./kode-limits";

// Sat Nov 7 2026, 10:00 local time.
const NOW = new Date(2026, 10, 7, 10, 0, 0).getTime();

describe("detectLimit", () => {
  test("reads the Kontinue server marker", () => {
    const hit = detectLimit("You've used your 5-hour limit.\n[[limit-reset:1794000000000]]", { now: NOW });
    expect(hit).toEqual({ resetAt: 1794000000000, message: "You've used your 5-hour limit." });
  });

  test("uses the reset time Rust read from Claude Code", () => {
    const hit = detectLimit("Claude Code stopped with an error.", { resetAt: NOW + 5000, now: NOW });
    expect(hit?.resetAt).toBe(NOW + 5000);
  });

  test("ignores errors that are not limits", () => {
    expect(detectLimit("Not logged in. Run /login", { now: NOW })).toBeNull();
    expect(detectLimit("model not found", { now: NOW })).toBeNull();
  });

  test("a limit with no time still counts", () => {
    expect(detectLimit("Rate limit exceeded", { now: NOW })).toEqual({
      resetAt: null,
      message: "Rate limit exceeded",
    });
  });
});

describe("parseResetTime", () => {
  test("Claude legacy epoch", () => {
    expect(parseResetTime("Claude AI usage limit reached|1794000000", NOW)).toBe(1794000000000);
  });

  test("relative hours and minutes", () => {
    expect(
      parseResetTime("You've hit your usage limit. Try again in 2 hours 13 minutes.", NOW),
    ).toBe(NOW + (2 * 60 + 13) * 60_000);
    expect(parseResetTime("rate limited, retry in 45m", NOW)).toBe(NOW + 45 * 60_000);
  });

  test("time of day later today and tomorrow", () => {
    expect(parseResetTime("5-hour limit reached ∙ resets 3pm", NOW)).toBe(
      new Date(2026, 10, 7, 15, 0).getTime(),
    );
    expect(parseResetTime("limit reached, resets at 9:30 AM", NOW)).toBe(
      new Date(2026, 10, 8, 9, 30).getTime(),
    );
  });

  test("absolute date", () => {
    expect(
      parseResetTime("You've hit your usage limit. Try again at Nov 9th, 2026 3:05 PM.", NOW),
    ).toBe(new Date(2026, 10, 9, 15, 5).getTime());
  });

  test("nothing to read", () => {
    expect(parseResetTime("Too many requests", NOW)).toBeNull();
  });
});

test("cleanLimitMarker and formatCountdown", () => {
  expect(cleanLimitMarker("Limit hit [[limit-reset:123]]")).toBe("Limit hit");
  expect(formatCountdown(NOW + 133 * 60_000, NOW)).toBe("in 2h 13m");
  expect(formatCountdown(NOW + 30_000, NOW)).toBe("in under a minute");
});
