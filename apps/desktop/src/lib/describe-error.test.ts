import { describe, expect, test } from "bun:test";
import { describeError } from "./describe-error";

describe("describeError", () => {
  test("Convex server error names the function and request", () => {
    const error = new Error(
      "[CONVEX Q(kode:getRecentMessages)] [Request ID: 1bb227960df815da] Server Error\n  Called by client",
    );
    const result = describeError(error);
    expect(result.title).toBe("Couldn't load this from the server");
    expect(result.detail).toBe("kode:getRecentMessages (request 1bb227960df815da)");
    expect(result.full).toContain("Server Error");
  });

  test("Convex error with a reason keeps the reason", () => {
    const result = describeError(new Error("[CONVEX M(kode:sendMessage)] Uncaught Error: Not signed in"));
    expect(result.detail).toBe("kode:sendMessage: Uncaught Error: Not signed in");
  });

  test("other errors pass their message through", () => {
    const result = describeError(new TypeError("m is not a function"));
    expect(result.title).toBe("Something went wrong here");
    expect(result.detail).toBe("m is not a function");
  });

  test("non-Error values still describe", () => {
    expect(describeError("boom").detail).toBe("boom");
  });
});
