// The crayon ring round a circled dish on the Kids Menu — PURE.
//
// The ring is drawn at the entry's own pixel size, never stretched from a
// fixed viewBox: a stretched path under `vector-effect: non-scaling-stroke`
// lets Chromium measure the draw-on dash in screen space, and a long name got
// a third of a ring. Each dish gets its own hand (where the crayon starts,
// which way it goes, how round the loop is, how far the tail overshoots), but
// every ring goes all the way round the entry and past where it began.

/**
 * How far the ring may reach past either end of the entry, in px, before its
 * wobble and tail. At every phone width the card's scroll box clips 30px left
 * of the entry; the ring may cross the placemat's dashed border on the way.
 */
export const RING_REACH = 25;

/**
 * How far the ring rises above and dips below the entry, in px, before its
 * wobble and tail. The rows either side keep their ink about 16px off.
 */
export const RING_RISE = { min: 8, max: 9.5 } as const;

/**
 * How round a hand draws: 2 is an ellipse, higher is squarer. A hand picks
 * from this range, and only an entry too long to fit a round ring inside
 * RING_REACH is drawn squarer, by as little as fits.
 */
export const RING_ROUNDNESS = { min: 2.1, max: 2.5 } as const;

/**
 * The line boxes carry leading above the name and below the country, so the
 * ink sits this far inside the entry's box (measured: 3 to 5px). The ring
 * clears the ink, not the leading.
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
  /** How square the loop is: 2 is an ellipse. */
  squareness: number;
}

/** The ring as points, for an entry `width` × `height` px, in the hand `seed` picks. */
export function crayonRingPoints(width: number, height: number, seed: number): CrayonRing {
  const r = rng(seed);
  const between = (lo: number, hi: number) => lo + (hi - lo) * r();

  const cx = width / 2 + between(-1.5, 1.5);
  const cy = height / 2 + between(-1, 1);

  // The crayon starts a touch inside and finishes a touch outside, so the
  // tail crosses the start rather than landing on it; the line wobbles a little.
  const spiral = between(1.5, 3);
  const wobble = between(0.4, 1);
  const lumps = r() < 0.5 ? 2 : 3;
  const phase = between(0, Math.PI * 2);

  // An oval (a superellipse, `n` 2 being an ellipse) round the ink's corners,
  // measured at the ring's innermost reach. The hand picks how round and how
  // tall; the width follows from those. An entry too long for that width
  // keeps the width at RING_REACH and squares up just enough to fit, and a
  // name wrapped onto two lines then grows taller.
  const shrink = spiral * 0.3 + wobble;
  const cornerX = width / 2 - INK_INSET.x + 1.5 + CLEARANCE;
  const cornerY = height / 2 - INK_INSET.y + 1 + CLEARANCE;
  const fits = (n: number, a: number, b: number) =>
    (cornerX / (a - shrink)) ** n + (cornerY / (b - shrink)) ** n <= 1;
  let n = between(RING_ROUNDNESS.min, RING_ROUNDNESS.max);
  // A box taller than the rise allows (a wrapped name) sets its own height.
  let b = Math.max(height / 2 + between(RING_RISE.min, RING_RISE.max), cornerY / 0.9 + shrink);
  let a = shrink + cornerX / (1 - (cornerY / (b - shrink)) ** n) ** (1 / n);
  const reach = width / 2 + RING_REACH - between(0, 3);
  if (a > reach) {
    a = reach;
    while (!fits(n, a, b) && n < 4) n += 0.05;
    while (!fits(n, a, b)) b += 0.5;
  }

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
  return { points, sweep, squareness: n };
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
