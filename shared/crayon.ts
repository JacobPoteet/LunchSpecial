// The crayon ring round a circled dish on the Kids Menu — PURE.
//
// The ring is drawn at the entry's own pixel size, never stretched from a
// fixed viewBox: a stretched path under `vector-effect: non-scaling-stroke`
// lets Chromium measure the draw-on dash in screen space, and a long name got
// a third of a ring. Each dish gets its own hand (where the crayon starts,
// which way it goes, how round the loop is, how far the tail overshoots), but
// every ring goes all the way round the entry and past where it began.

/** Room either side of the entry before the hand adds its own. */
export const RING_PAD = { x: 10, y: 5 } as const;

/**
 * The line boxes carry leading above the name and below the country, so the
 * ink sits this far inside the entry's box. The ring clears the ink, not the
 * leading, which is what lets it stay round without towering over the row.
 */
export const INK_INSET = { x: 0, y: 3 } as const;

/** The least room, in px, between the ring and the ink's corners. */
export const CLEARANCE = 1.5;

/** How far past a full turn the tail runs, in radians: always visibly closed. */
export const RING_OVERSHOOT = { min: 0.35, max: 0.7 } as const;

const SAMPLES = 120;

/** A small seeded generator (mulberry32), so a dish always gets the same ring. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CrayonRing {
  /** Points along the stroke, in the entry's pixels (0,0 is its top left). */
  points: Array<[number, number]>;
  /** Radians the stroke sweeps: one full turn plus the overshoot. */
  sweep: number;
}

/** The ring as points, for an entry `width` × `height` px, in the hand `seed` picks. */
export function crayonRingPoints(width: number, height: number, seed: number): CrayonRing {
  const r = rng(seed);
  const between = (lo: number, hi: number) => lo + (hi - lo) * r();

  // An oval, a little squarer than an ellipse (a superellipse) so it hugs a
  // long entry rather than ballooning over the rows either side. A longer
  // entry gets a little squarer still.
  const n = between(2.6, 3.2) + Math.min(0.8, Math.max(0, (width / height - 2) * 0.15));
  const cx = width / 2 + between(-1.5, 1.5);
  const cy = height / 2 + between(-1, 1);
  const a = width / 2 + RING_PAD.x + width * 0.04 + between(0, 3);

  // The crayon starts a touch inside and finishes a touch outside, so the
  // tail crosses the start rather than landing on it; the line wobbles a little.
  const spiral = between(2, 4);
  const wobble = between(0.5, 1.2);
  const lumps = r() < 0.5 ? 2 : 3;
  const phase = between(0, Math.PI * 2);

  // The width is the hand's; the height is whatever clears the ink's corners
  // at the ring's innermost reach.
  const shrink = spiral * 0.3 + wobble;
  const cornerX = width / 2 - INK_INSET.x + 1.5 + CLEARANCE;
  const cornerY = height / 2 - INK_INSET.y + 1 + CLEARANCE;
  const fit = cornerY / (1 - (cornerX / (a - shrink)) ** n) ** (1 / n) + shrink;
  const b = Math.max(height / 2 + RING_PAD.y, fit) + between(0, 1.5);

  // Start somewhere along the top, mostly anticlockwise, as most hands go.
  const start = Math.PI * between(1.15, 1.85);
  const dir = r() < 0.7 ? -1 : 1;
  const sweep = Math.PI * 2 + between(RING_OVERSHOOT.min, RING_OVERSHOOT.max);

  const points: Array<[number, number]> = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    const t = start + dir * sweep * u;
    const grow = spiral * (u - 0.3) + wobble * Math.sin(lumps * t + phase);
    const c = Math.cos(t);
    const s = Math.sin(t);
    const ex = Math.sign(c) * Math.abs(c) ** (2 / n);
    const ey = Math.sign(s) * Math.abs(s) ** (2 / n);
    points.push([cx + (a + grow) * ex, cy + (b + grow) * ey]);
  }
  return { points, sweep };
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

/** The ring as an SVG path `d`, smoothed through its points (Catmull-Rom as cubic Béziers). */
export function crayonRing(width: number, height: number, seed: number): string {
  const p = crayonRingPoints(width, height, seed).points;
  let d = `M${fmt(p[0][0])} ${fmt(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d;
}
