import { describe, expect, it } from "@jest/globals";

import { arcAt, geometry } from "@/lib/glow-geometry";

describe("glow rail geometry", () => {
  const g = geometry(360, 112, 26);

  it("starts at top-center and walks the border clockwise", () => {
    expect(arcAt(0, g)).toBeCloseTo(0, 3);
    // 90°: middle of the right edge = quarter of the way round a symmetric box.
    expect(arcAt(90, g)).toBeCloseTo(g.total / 4, 1);
    expect(arcAt(180, g)).toBeCloseTo(g.total / 2, 1);
    expect(arcAt(270, g)).toBeCloseTo((3 * g.total) / 4, 1);
  });

  it("is continuous and increasing all the way round", () => {
    let previous = arcAt(0.05, g);
    for (let deg = 0.5; deg < 359.9; deg += 0.5) {
      const next = arcAt(deg, g);
      expect(next).toBeGreaterThan(previous);
      // No jumps: a half-degree step never moves more than ~4% of the border.
      expect(next - previous).toBeLessThan(g.total * 0.04);
      previous = next;
    }
  });

  it("moves slowly past top-center and fast toward the ends, like CSS conic", () => {
    // On a wide box the same 10° covers far more border near the sides.
    const nearCenter = arcAt(20, g) - arcAt(10, g);
    const nearEnd = arcAt(80, g) - arcAt(70, g);
    expect(nearEnd).toBeGreaterThan(nearCenter * 2);
  });
});
