// Pure all-time growth fold for the admin Trends tab (GitHub #90): games played
// per ET day since the first round ever, plus the least-squares line through it.
// DB-free so it stays unit-testable; the route in routes/admin.ts feeds it the
// same all-time hour buckets the hour-of-day chart already reads.
//
// Same timezone problem as worker/players.ts and worker/service.ts: started_at
// is stored in UTC and SQLite has no named-timezone support, so rows arrive as
// UTC hour buckets ("YYYY-MM-DD HH") and are folded into ET days here — the same
// midnight-ET boundary the game rolls over on.

import { gameToday } from "../shared/time";
import type { GameGrowth, GrowthDay, GrowthTrend } from "../shared/types";

/**
 * Below this many days there is no trend, only two points and an opinion. The
 * line is withheld rather than drawn faintly, the same rule `paceNote` follows
 * for a baseline under one game: a confident wrong slope is worse than a blank.
 *
 * A week also means the fit always spans at least one full weekend, so a chart
 * opened on a Monday isn't reading a weekend dip as decline.
 */
export const GROWTH_TREND_MIN_DAYS = 7;

/** One all-time UTC hour bucket: how many rounds started in it. */
export interface GrowthRow {
  /** UTC hour bucket from strftime('%Y-%m-%d %H', started_at). */
  bucket: string;
  n: number;
}

/** "2026-07-24" → "2026-07-25". Plain calendar arithmetic — these are already ET days. */
function nextDate(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Fit a straight line through the series by least squares, indexing days 0..n-1.
 *
 * Returns null when the window is too short to fit ({@link GROWTH_TREND_MIN_DAYS})
 * — and only then. A flat series is a real answer ("holding steady"), so a slope
 * of exactly 0 is reported rather than suppressed.
 */
function fitTrend(days: GrowthDay[]): GrowthTrend | null {
  const n = days.length;
  if (n < GROWTH_TREND_MIN_DAYS) return null;

  const meanX = (n - 1) / 2;
  const meanY = days.reduce((sum, d) => sum + d.started, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    covariance += (i - meanX) * (days[i].started - meanY);
    variance += (i - meanX) ** 2;
  }
  // variance is 0 only at n === 1, which the length guard already excluded, but
  // dividing by it would poison the whole chart with NaN — cheap to rule out.
  if (variance === 0) return null;

  const slope = covariance / variance;
  const intercept = meanY - slope * meanX;
  return { slope, first: intercept, last: intercept + slope * (n - 1), days: n };
}

/**
 * Fold all-time UTC hour buckets into a continuous per-ET-day series and fit the
 * trend through it.
 *
 * Two things the caller can't do in SQL:
 *
 * - **Zero-filling.** Every day between the first recorded round and today gets
 *   a row, present with 0 if nothing was played. The beacon was live on all of
 *   them, so a quiet day is a measurement; leaving it out would compress the
 *   x-axis around whichever days happened to be busy and tilt the fit.
 * - **Clamping to today.** Days after the server's ET today can't be real —
 *   started_at is server-written — so a bogus bucket is dropped rather than
 *   stretching the fill loop across whatever year it claims.
 */
export function foldGrowth(rows: Iterable<GrowthRow>, today: string): GameGrowth {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    // Rebuilt at mid-hour to stay clear of boundary rounding, as everywhere else.
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    const et = gameToday(instant);
    if (et > today) continue;
    byDay.set(et, (byDay.get(et) ?? 0) + r.n);
  }

  const dates = [...byDay.keys()].sort();
  if (dates.length === 0) return { days: [], trend: null };

  const days: GrowthDay[] = [];
  for (let d = dates[0]; d <= today; d = nextDate(d)) {
    days.push({ date: d, started: byDay.get(d) ?? 0 });
  }

  return { days, trend: fitTrend(days) };
}
