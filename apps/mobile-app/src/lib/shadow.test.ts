import { describe, expect, it, jest } from "@jest/globals";

import { rgba, softShadow } from "@/lib/shadow";

// babel-jest hoists this above the imports.
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

describe("softShadow", () => {
  it("draws a boxShadow on Android instead of an elevation", () => {
    expect(softShadow({ color: "#000", opacity: 0.12, radius: 14, offsetY: 10 })).toEqual({
      boxShadow: "0px 10px 28px rgba(0, 0, 0, 0.12)",
    });
  });

  it("converts short, long and alpha hex colors", () => {
    expect(rgba("#fff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
    expect(rgba("#ff0080", 1)).toBe("rgba(255, 0, 128, 1)");
    expect(rgba("#ff008080", 1)).toBe("rgba(255, 0, 128, 0.502)");
    expect(rgba("transparent", 0)).toBe("transparent");
  });
});
