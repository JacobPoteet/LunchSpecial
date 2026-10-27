import { describe, expect, it } from "vitest";
import { CLEARANCE, crayonRing, crayonRingPoints, INK_INSET } from "./crayon";

/** Winding-number test: is (x, y) inside the polygon? */
function inside(poly: Array<[number, number]>, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Shortest distance from (x, y) to the polygon's edges. */
function clearance(poly: Array<[number, number]>, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + k * dx - x, ay + k * dy - y));
  }
  return best;
}

// Entries (name over country): a short name to a long one, a name wrapped
// onto two lines at 320px, and Discord's PIP rows (name beside country).
const BOXES: Array<[number, number]> = [
  [30, 42],
  [60, 42],
  [140, 42],
  [260, 42],
  [200, 66],
  [120, 20],
  [300, 20],
];
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe("crayonRing", () => {
  it("goes all the way round every entry, clear of its ink", () => {
    for (const [w, h] of BOXES) {
      const top = INK_INSET.y;
      const bottom = h - INK_INSET.y;
      for (const seed of SEEDS) {
        const { points, sweep } = crayonRingPoints(w, h, seed);
        // The first full turn is the loop; the rest is the tail.
        const loop = points.slice(0, Math.ceil(((points.length - 1) * Math.PI * 2) / sweep) + 1);
        for (const x of [0, w / 2, w]) {
          for (const y of [top, h / 2, bottom]) {
            if (x === w / 2 && y === h / 2) continue;
            expect(inside(loop, x, y), `${w}x${h} seed ${seed} at ${x},${y}`).toBe(true);
            expect(clearance(loop, x, y), `${w}x${h} seed ${seed} at ${x},${y}`).toBeGreaterThanOrEqual(CLEARANCE);
          }
        }
      }
    }
  });

  it("runs past where it started, so it reads as closed", () => {
    for (const seed of SEEDS) {
      expect(crayonRingPoints(100, 24, seed).sweep).toBeGreaterThan(Math.PI * 2 + 0.3);
    }
  });

  // Inside the card's dashed border at 320px, and off the ink of the rows
  // either side (each row has 6px of padding, then the line box's leading).
  it("stays close to the entry", () => {
    for (const [w, h] of BOXES.filter(([, h]) => h <= 42)) {
      for (const seed of SEEDS) {
        const { points } = crayonRingPoints(w, h, seed);
        const xs = points.map(([x]) => x);
        const ys = points.map(([, y]) => y);
        if (h === 42) {
          expect(Math.min(...xs)).toBeGreaterThan(-30);
          expect(Math.max(...xs)).toBeLessThan(w + 30);
        }
        expect(Math.min(...ys)).toBeGreaterThan(-17);
        expect(Math.max(...ys)).toBeLessThan(h + 17);
      }
    }
  });

  it("varies by dish and holds for one", () => {
    expect(crayonRing(120, 24, 7)).toBe(crayonRing(120, 24, 7));
    expect(new Set(SEEDS.slice(0, 20).map((s) => crayonRing(120, 24, s))).size).toBe(20);
  });
});
