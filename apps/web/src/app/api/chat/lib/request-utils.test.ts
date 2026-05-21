import { describe, expect, test } from "bun:test";
import { createInputTooLongResponse } from "./request-utils";

describe("createInputTooLongResponse", () => {
  test("returns a 400 JSON response with a friendly message", async () => {
    const response = createInputTooLongResponse({
      tierLabel: "Free users",
      maxInputTokens: 2_000,
      estimatedInputTokens: 2_800,
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      code: "INPUT_TOO_LONG",
      error:
        "Your message is too long for your current plan. Please shorten it and try again.",
      details: {
        tier: "Free users",
        maxInputTokens: 2_000,
        estimatedInputTokens: 2_800,
      },
    });
  });
});
