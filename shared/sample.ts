// How much a number is allowed to claim, given how few it was measured from.
//
// This game records tens of rounds a day, not thousands. At that volume "67% win
// rate" off three completions and "67%" off three hundred render identically and
// mean completely different things — the first moves 33 points if one more player
// loses. Every rate the dashboard prints goes through here so the two can't look
// alike.
//
// The dashboard already had this instinct in four separate places (the retention
// curve's minimum cohort, `paceNote` refusing a baseline under one game,
// `GROWTH_TREND_MIN_DAYS`, `difficultyNote`'s guard). This is that rule, written
// once: pure, shared by worker and client, and unit-tested.

/**
 * Below this many observations a percentage is a mood, not a measurement, and
 * gets a range or a caveat rather than a bare number.
 *
 * Thirty is the conventional line and it lands about right for this game: at ~30
 * completions a day, one day's win rate is worth a glance and one day's *share*
 * rate (a much rarer event) still isn't.
 */
export const SMALL_SAMPLE_MIN = 30;

/** The 95% z-score. Not configurable — one confidence level, quoted one way. */
const Z = 1.959963985;

/** A proportion and the range it could honestly be, both as 0..100 percentages. */
export interface Rate {
  /** successes / trials as a rounded percentage — the number that gets printed big. */
  pct: number;
  /** Low end of the 95% interval, rounded. */
  low: number;
  /** High end of the 95% interval, rounded. */
  high: number;
  /** The denominator, carried along so callers never have to quote a rate without it. */
  of: number;
  /** Whether `of` is under {@link SMALL_SAMPLE_MIN} — i.e. the range is the story. */
  small: boolean;
}

/**
 * The Wilson score interval for a proportion, as percentages.
 *
 * Wilson rather than the textbook normal approximation because this game lives
 * exactly where the normal approximation breaks: small `trials`, and rates that
 * sit near 0 or 1 (nobody shares; almost everybody solves). Wilson stays inside
 * 0..100 and stays sane at 0-of-4 and 4-of-4, both of which are real days here.
 *
 * Returns null for zero trials — there is no interval around a measurement that
 * was never made, and that's a different thing from a wide one.
 */
export function rate(successes: number, trials: number): Rate | null {
  if (!Number.isFinite(trials) || trials <= 0) return null;
  const n = trials;
  const p = Math.min(1, Math.max(0, successes / n));
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const spread = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    pct: Math.round(p * 100),
    low: Math.round(Math.max(0, centre - spread) * 100),
    high: Math.round(Math.min(1, centre + spread) * 100),
    of: n,
    small: n < SMALL_SAMPLE_MIN,
  };
}

/** Whether a denominator is too thin for its percentage to stand on its own. */
export const isSmallSample = (of: number) => of > 0 && of < SMALL_SAMPLE_MIN;

/**
 * The range as a compact suffix — "58–92%" — or null when the sample is big
 * enough that the point estimate carries itself.
 *
 * Deliberately only rendered for thin samples. Putting an interval on every
 * number on the page teaches you to stop reading them; putting one on exactly the
 * numbers that need it is a signal.
 */
export function rangeLabel(r: Rate | null): string | null {
  if (r === null || !r.small) return null;
  return `${r.low}–${r.high}%`;
}

/**
 * Whether two rates are far enough apart to be worth acting on, judged by
 * whether their 95% intervals overlap at all.
 *
 * Conservative on purpose — non-overlapping intervals is a *stricter* test than a
 * difference-of-proportions test, so this says "different" less often than it
 * strictly could. That is the right direction to be wrong in on a dashboard whose
 * whole job is to stop its owner shipping decisions off three good afternoons.
 */
export function separated(a: Rate | null, b: Rate | null): boolean {
  if (a === null || b === null) return false;
  return a.low > b.high || b.low > a.high;
}

/**
 * A weighted median from (value, count) pairs — the shape every aggregate here
 * arrives in, since the queries group rather than return one row per round.
 *
 * Median rather than mean wherever it's used for durations: solve times have no
 * upper bound (a round left open in a tab and finished at lunch is a real row),
 * so one outlier can move a mean by minutes. Even-count medians take the lower of
 * the two middles rather than averaging them, because these are counts of whole
 * things and "4.5 guesses" isn't an observation anybody made.
 */
export function medianOf(pairs: Iterable<readonly [value: number, count: number]>): number | null {
  const sorted = [...pairs].filter(([, n]) => n > 0).sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) return null;
  const target = Math.floor((total - 1) / 2);
  let seen = 0;
  for (const [value, n] of sorted) {
    seen += n;
    if (seen > target) return value;
  }
  return sorted[sorted.length - 1][0];
}

/**
 * The value at a given percentile (0..1) from the same (value, count) pairs,
 * using the nearest-rank method — again a real observed value, not an
 * interpolation between two of them.
 */
export function percentileOf(
  pairs: Iterable<readonly [value: number, count: number]>,
  q: number,
): number | null {
  const sorted = [...pairs].filter(([, n]) => n > 0).sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) return null;
  const target = Math.min(total, Math.max(1, Math.ceil(q * total)));
  let seen = 0;
  for (const [value, n] of sorted) {
    seen += n;
    if (seen >= target) return value;
  }
  return sorted[sorted.length - 1][0];
}
