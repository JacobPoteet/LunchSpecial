// Circle packing, for the ingredient web: families as rings, ingredients as dots.
//
// A greedy tangent placement: each circle, largest first, goes at the position
// tangent to two already-placed circles that overlaps nothing and sits closest
// to the middle. It is not the tightest possible packing and doesn't try to be.
// It is deterministic (the same input draws the same picture, so a screenshot
// is reproducible and a test can pin the geometry), dependency-free, and
// O(n^3), which is nothing at the two levels it runs at (about 60 families, and
// at most a few dozen ingredients in any one of them).
//
// Pure, imports nothing: the dashboard bundle and the docs generator (plain
// node) both read this one file.

export interface Disc {
  x: number;
  y: number;
  r: number;
}

/** Positions for circles of the given radii, centred on their own bounding box; `radius` encloses all of them. */
export function packCircles(radii: readonly number[], gap: number): { discs: Disc[]; radius: number } {
  const order = radii.map((_, i) => i).sort((a, b) => radii[b] - radii[a] || a - b);
  const placed: Disc[] = [];
  const out: Disc[] = new Array(radii.length);

  for (const idx of order) {
    const r = radii[idx];
    let spot: { x: number; y: number } | null = null;
    if (placed.length === 0) spot = { x: 0, y: 0 };
    else if (placed.length === 1) spot = { x: placed[0].r + r + gap, y: 0 };
    else {
      let best = Infinity;
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          for (const p of tangent(placed[i], placed[j], r, gap)) {
            const score = Math.hypot(p.x, p.y);
            if (score < best && !overlaps(placed, p.x, p.y, r, gap)) {
              best = score;
              spot = p;
            }
          }
        }
      }
      // Cannot happen with two or more circles down (every pair has candidates
      // and the outermost is always clear), but a missed case should still draw.
      spot ??= { x: Math.max(...placed.map((d) => d.x + d.r)) + r + gap, y: 0 };
    }
    const disc = { x: spot.x, y: spot.y, r };
    placed.push(disc);
    out[idx] = disc;
  }

  if (out.length === 0) return { discs: [], radius: 0 };
  const minX = Math.min(...out.map((d) => d.x - d.r));
  const maxX = Math.max(...out.map((d) => d.x + d.r));
  const minY = Math.min(...out.map((d) => d.y - d.r));
  const maxY = Math.max(...out.map((d) => d.y + d.r));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const discs = out.map((d) => ({ x: d.x - cx, y: d.y - cy, r: d.r }));
  const radius = Math.max(...discs.map((d) => Math.hypot(d.x, d.y) + d.r));
  return { discs, radius };
}

function overlaps(placed: readonly Disc[], x: number, y: number, r: number, gap: number): boolean {
  return placed.some((d) => Math.hypot(d.x - x, d.y - y) < d.r + r + gap - 1e-6);
}

/** The (up to two) centres at which a circle of radius `r` touches both `a` and `b`, a `gap` clear of each. */
function tangent(a: Disc, b: Disc, r: number, gap: number): { x: number; y: number }[] {
  const da = a.r + r + gap;
  const db = b.r + r + gap;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > da + db || d < Math.abs(da - db)) return [];
  const along = (da * da - db * db + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, da * da - along * along));
  const mx = a.x + (dx * along) / d;
  const my = a.y + (dy * along) / d;
  return [
    { x: mx + (h * dy) / d, y: my - (h * dx) / d },
    { x: mx - (h * dy) / d, y: my + (h * dx) / d },
  ];
}

export interface PackLeaf {
  key: string;
  r: number;
}

export interface PackGroup {
  key: string;
  leaves: PackLeaf[];
}

export interface PackedGroup extends Disc {
  key: string;
  leaves: (Disc & { key: string })[];
}

export interface PackedWeb {
  groups: PackedGroup[];
  /** The box that holds everything, for an SVG viewBox. */
  bounds: { x: number; y: number; width: number; height: number };
}

/**
 * Two levels: leaves packed inside each group's ring, rings packed against each
 * other. Leaf positions come back in absolute coordinates, so a caller draws
 * the rings and the dots without any nesting transform.
 */
export function packWeb(groups: readonly PackGroup[], opts: { leafGap?: number; ringPad?: number; ringGap?: number } = {}): PackedWeb {
  const { leafGap = 1.5, ringPad = 5, ringGap = 8 } = opts;
  const inner = groups.map((g) => {
    const p = packCircles(g.leaves.map((l) => l.r), leafGap);
    return { group: g, ...p, ring: p.radius + ringPad };
  });
  const outer = packCircles(inner.map((i) => i.ring), ringGap);
  const packed: PackedGroup[] = inner.map((g, i) => {
    const ring = outer.discs[i];
    return {
      key: g.group.key,
      x: ring.x,
      y: ring.y,
      r: g.ring,
      leaves: g.group.leaves.map((l, k) => ({ key: l.key, x: ring.x + g.discs[k].x, y: ring.y + g.discs[k].y, r: l.r })),
    };
  });
  if (packed.length === 0) return { groups: [], bounds: { x: 0, y: 0, width: 0, height: 0 } };
  const pad = ringGap;
  const minX = Math.min(...packed.map((g) => g.x - g.r)) - pad;
  const maxX = Math.max(...packed.map((g) => g.x + g.r)) + pad;
  const minY = Math.min(...packed.map((g) => g.y - g.r)) - pad;
  const maxY = Math.max(...packed.map((g) => g.y + g.r)) + pad;
  return { groups: packed, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}
