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

// Entries (name over country, 40px tall): a short name to the longest on the
// menu (220px), a name wrapped onto two lines, and Discord's PIP rows (name
// beside country).
const BOXES: Array<[number, number]> = [
  [30, 40],
  [60, 40],
  [140, 40],
  [220, 40],
  [200, 64],
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

  // Inside the card's scroll box (30px left of the entry at every phone width,
  // less the stroke) and off the ink of the rows either side (about 16px off).
  it("stays close to the entry", () => {
    for (const [w, h] of BOXES.filter(([, h]) => h <= 40)) {
      for (const seed of SEEDS) {
        const { points } = crayonRingPoints(w, h, seed);
        const xs = points.map(([x]) => x);
        const ys = points.map(([, y]) => y);
        if (h === 40) {
          expect(Math.min(...xs)).toBeGreaterThan(-28.5);
          expect(Math.max(...xs)).toBeLessThan(w + 28.5);
        }
        expect(Math.min(...ys)).toBeGreaterThan(-14.5);
        expect(Math.max(...ys)).toBeLessThan(h + 14.5);
      }
    }
  });

  // The point of the ring: an oval, not a box (2 is an ellipse). Most names
  // are 140px or under; only the longest square up, and only as far as fits.
  it("stays round", () => {
    for (const [w, h, most] of [
      [30, 40, 2.5],
      [90, 40, 2.5],
      [140, 40, 2.75],
      [220, 40, 3.3],
    ]) {
      for (const seed of SEEDS) {
        expect(crayonRingPoints(w, h, seed).squareness, `${w}x${h} seed ${seed}`).toBeLessThanOrEqual(most);
      }
    }
  });

  it("varies by dish and holds for one", () => {
    expect(crayonRing(120, 24, 7)).toBe(crayonRing(120, 24, 7));
    expect(new Set(SEEDS.slice(0, 20).map((s) => crayonRing(120, 24, s))).size).toBe(20);
  });
});
