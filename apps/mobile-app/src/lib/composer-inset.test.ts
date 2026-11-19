import { describe, expect, it } from "@jest/globals";

import { composerBottomInset } from "@/lib/composer-inset";

describe("composerBottomInset", () => {
  it("sits just above a gesture bar or home indicator", () => {
    expect(composerBottomInset(24, false)).toBe(10);
    expect(composerBottomInset(34, false)).toBe(20);
    expect(composerBottomInset(0, false)).toBe(8);
  });

  it("keeps Android's 3-button bar clear", () => {
    expect(composerBottomInset(48, false)).toBe(52);
  });

  it("hugs the keyboard when it is open", () => {
    expect(composerBottomInset(48, true)).toBe(8);
  });
});
