import { describe, expect, test } from "bun:test";
import {
  getTotalOutputTokens,
  stopWhenOutputBudgetReached,
} from "./stream-runtime";

describe("getTotalOutputTokens", () => {
  test("adds output tokens across steps", () => {
    expect(
      getTotalOutputTokens([
        { usage: { outputTokens: 75 } },
        { usage: { outputTokens: 50 } },
        { usage: {} },
      ]),
    ).toBe(125);
  });
});

describe("stopWhenOutputBudgetReached", () => {
  test("stops once the cumulative output budget is exhausted", () => {
    const shouldStop = stopWhenOutputBudgetReached(200);

    expect(
      shouldStop({
        steps: [
          { usage: { outputTokens: 120 } },
          { usage: { outputTokens: 79 } },
        ] as never[],
      }),
    ).toBe(false);

    expect(
      shouldStop({
        steps: [
          { usage: { outputTokens: 120 } },
          { usage: { outputTokens: 80 } },
        ] as never[],
      }),
    ).toBe(true);
  });
});
