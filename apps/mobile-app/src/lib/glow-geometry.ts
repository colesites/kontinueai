// Geometry behind GlowRail: where a CSS conic-gradient angle lands on a
// rounded rectangle's border, as arc length clockwise from top-center. Kept
// free of React Native imports so it can be unit tested; `arcAt` is a
// Reanimated worklet and runs on the UI thread every frame.

export const GLOW_STROKE = 1.5;
const STROKE = GLOW_STROKE;

export type Geometry = {
  /** Half-extents and corner radius of the stroke's centerline. */
  a: number;
  b: number;
  r: number;
  total: number;
};

export function geometry(width: number, height: number, radius: number): Geometry {
  const a = width / 2 - STROKE / 2;
  const b = height / 2 - STROKE / 2;
  const r = Math.max(0, Math.min(radius - STROKE / 2, a, b));
  const total = 4 * (a - r) + 4 * (b - r) + 2 * Math.PI * r;
  return { a, b, r, total };
}

/**
 * Arc length, clockwise from top-center, where a ray from the center at
 * `degrees` (0 = up, clockwise, as in CSS conic-gradient) meets the border.
 */
export function arcAt(degrees: number, g: Geometry): number {
  "worklet";
  const { a, b, r, total } = g;
  const rad = (degrees * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const tx = Math.abs(dx) > 1e-6 ? a / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const ty = Math.abs(dy) > 1e-6 ? b / Math.abs(dy) : Number.POSITIVE_INFINITY;
  let t = Math.min(tx, ty);
  let x = dx * t;
  let y = dy * t;
  const sx = x >= 0 ? 1 : -1;
  const sy = y >= 0 ? 1 : -1;
  // In a corner zone: intersect with the corner circle instead.
  if (Math.abs(x) > a - r && Math.abs(y) > b - r && r > 0) {
    const cx = sx * (a - r);
    const cy = sy * (b - r);
    const bq = dx * cx + dy * cy;
    const cq = cx * cx + cy * cy - r * r;
    t = bq + Math.sqrt(Math.max(0, bq * bq - cq));
    x = dx * t;
    y = dy * t;
  }
  const ex = a - r;
  const ey = b - r;
  const quarter = (Math.PI * r) / 2;
  // Walk the perimeter clockwise from top-center.
  if (y <= -ey && Math.abs(x) <= ex) {
    return x >= 0 ? x : total + x; // top edge
  }
  if (x >= ex && y < -ey) {
    const ang = Math.atan2(y + ey, x - ex) + Math.PI / 2; // 0..π/2
    return ex + ang * r;
  }
  if (x >= ex && Math.abs(y) <= ey) {
    return ex + quarter + (y + ey);
  }
  if (x >= ex && y > ey) {
    const ang = Math.atan2(y - ey, x - ex);
    return ex + quarter + 2 * ey + ang * r;
  }
  if (y >= ey && Math.abs(x) <= ex) {
    return ex + 2 * quarter + 2 * ey + (ex - x);
  }
  if (x <= -ex && y > ey) {
    const ang = Math.atan2(y - ey, x + ex) - Math.PI / 2; // 0..π/2
    return 3 * ex + 2 * quarter + 2 * ey + ang * r;
  }
  if (x <= -ex && Math.abs(y) <= ey) {
    return 3 * ex + 3 * quarter + 2 * ey + (ey - y);
  }
  // top-left corner
  const ang = Math.atan2(y + ey, x + ex) + Math.PI; // 0..π/2
  return 3 * ex + 3 * quarter + 4 * ey + ang * r;
}
