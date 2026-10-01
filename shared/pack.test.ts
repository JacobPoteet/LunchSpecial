import { describe, expect, it } from "vitest";
import { packCircles, packWeb, type Disc } from "./pack";

const clear = (a: Disc, b: Disc, gap: number) => Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r + gap - 1e-6;

describe("packCircles", () => {
  it("returns nothing for nothing, and one disc at the origin for one", () => {
    expect(packCircles([], 2)).toEqual({ discs: [], radius: 0 });
    const one = packCircles([7], 2);
    expect(one.discs).toEqual([{ x: 0, y: 0, r: 7 }]);
    expect(one.radius).toBe(7);
  });

  it("never overlaps, and keeps each radius in the input's order", () => {
    const radii = [30, 4, 12, 4, 20, 9, 9, 6, 14, 5, 5, 5, 18, 7, 7, 3, 3, 3];
    const { discs } = packCircles(radii, 2);
    expect(discs.map((d) => d.r)).toEqual(radii);
    for (let i = 0; i < discs.length; i++) {
      for (let j = i + 1; j < discs.length; j++) expect(clear(discs[i], discs[j], 2)).toBe(true);
    }
  });

  it("encloses every disc in the radius it reports", () => {
    const { discs, radius } = packCircles([20, 15, 10, 10, 5, 5, 5], 3);
    for (const d of discs) expect(Math.hypot(d.x, d.y) + d.r).toBeLessThanOrEqual(radius + 1e-6);
  });

  it("is deterministic: the same input draws the same picture", () => {
    const radii = [11, 5, 5, 9, 3, 14, 6];
    expect(packCircles(radii, 2)).toEqual(packCircles(radii, 2));
  });

  it("packs reasonably tight: not a long line", () => {
    // Twenty equal discs in a row would be 20 * 2r wide; a packing should come in well under that.
    const { radius } = packCircles(new Array(20).fill(10), 0);
    expect(radius).toBeLessThan(70);
  });
});

describe("packWeb", () => {
  const groups = [
    { key: "citrus", leaves: [{ key: "lemon", r: 20 }, { key: "lime", r: 18 }, { key: "orange", r: 14 }] },
    { key: "pasta", leaves: [{ key: "pasta", r: 15 }, { key: "noodles", r: 15 }] },
    { key: "lone", leaves: [{ key: "x", r: 6 }] },
  ];
  const web = packWeb(groups);

  it("keeps every dot inside its ring and every ring clear of the others", () => {
    for (const g of web.groups) {
      for (const l of g.leaves) expect(Math.hypot(l.x - g.x, l.y - g.y) + l.r).toBeLessThanOrEqual(g.r + 1e-6);
    }
    for (let i = 0; i < web.groups.length; i++) {
      for (let j = i + 1; j < web.groups.length; j++) expect(clear(web.groups[i], web.groups[j], 8)).toBe(true);
    }
  });

  it("returns the leaves under their groups, by key", () => {
    expect(web.groups.map((g) => g.key)).toEqual(["citrus", "pasta", "lone"]);
    expect(web.groups[0].leaves.map((l) => l.key)).toEqual(["lemon", "lime", "orange"]);
  });

  it("reports a box that holds every ring", () => {
    const { x, y, width, height } = web.bounds;
    for (const g of web.groups) {
      expect(g.x - g.r).toBeGreaterThanOrEqual(x);
      expect(g.x + g.r).toBeLessThanOrEqual(x + width);
      expect(g.y - g.r).toBeGreaterThanOrEqual(y);
      expect(g.y + g.r).toBeLessThanOrEqual(y + height);
    }
  });

  it("is empty for no groups", () => {
    expect(packWeb([]).groups).toEqual([]);
  });
});
