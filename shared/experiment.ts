// Did the thing I shipped do anything?
//
// Pure before/after comparison for the admin Experiments tab. Shared by worker
// and client, DB-free, unit-tested.
//
// This module exists because the honest answer to that question, at this game's
// volume, is usually "you can't tell yet" — and a dashboard that can't say so
// will instead show a number that went up. Everything here is built to make "not
// yet" a first-class result rather than an absence:
//
//   - the verdict is one of four states, and "inconclusive" is one of them;
//   - every comparison carries how much the metric moves on its own, so a
//     difference can be read against the noise it has to beat;
//   - when the answer is inconclusive it comes with how many more days it would
//     take, which turns "I don't know" into a date.
//
// The statistics are deliberately conservative. A dashboard's failure mode isn't
// missing a real effect, it's talking its owner into shipping noise.

import { rate, separated, type Rate } from "./sample";
import { RATE_METRICS, type ExperimentDay, type ExperimentMetric } from "./types";

/** Default days either side of the ship date. A week each way spans two weekends. */
export const DEFAULT_WINDOW_DAYS = 14;

/** Window lengths the tab offers. */
export const WINDOW_CHOICES = [7, 14, 28] as const;

/**
 * The relative change the sensitivity read is quoted for. "How long until I could
 * see a 20% swing" is a question with an answer; "until I could see any change"
 * doesn't have one, because arbitrarily small effects need arbitrarily long.
 */
export const TARGET_LIFT = 0.2;

/** 95% two-sided significance and 80% power — the conventional pair, stated once. */
const Z_ALPHA = 1.959963985;
const Z_BETA = 0.8416212336;

/** A period's worth of one metric, reduced to the numbers a comparison needs. */
export interface Side {
  /** ET days in the period that actually had data available. */
  days: number;
  /**
   * The headline value: mean per day for a count metric, percentage for a rate.
   * Null when the period has nothing to measure (no days, or a zero denominator).
   */
  value: number | null;
  /** For rate metrics: the pooled proportion and its interval. Null for counts. */
  rate: Rate | null;
  /** For count metrics: the day-to-day standard deviation. Null for rates. */
  sd: number | null;
  /** Total observations behind `value` — days summed, or the rate's denominator. */
  n: number;
}

export type Verdict = "moved-up" | "moved-down" | "no-change" | "inconclusive";

export interface Comparison {
  metric: ExperimentMetric;
  isRate: boolean;
  before: Side;
  after: Side;
  /** Relative change, e.g. 0.18 for +18%. Null when either side has no value. */
  relative: number | null;
  verdict: Verdict;
  /**
   * Roughly how many more days of "after" data a {@link TARGET_LIFT} change would
   * need before it could be told apart from noise. Null when the answer is
   * already conclusive, or when there's too little "before" to project from.
   */
  daysNeeded: number | null;
}

/** Whole days from ET day `a` to ET day `b`. Plain calendar days, no zone involved. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** The numerator/denominator pair a rate metric pools over a period. */
function ratioOf(metric: ExperimentMetric, days: ExperimentDay[]): { hits: number; of: number } {
  let hits = 0;
  let of = 0;
  for (const d of days) {
    if (metric === "finishRate") {
      hits += d.completed;
      of += d.started;
    } else if (metric === "winRate") {
      hits += d.solved;
      of += d.completed;
    } else {
      hits += d.shared;
      of += d.completed;
    }
  }
  return { hits, of };
}

/** One day's value for a count metric, or null when that day wasn't measured. */
function countOn(metric: ExperimentMetric, day: ExperimentDay): number | null {
  if (metric === "started") return day.started;
  if (metric === "players") return day.players;
  return day.newPlayers;
}

/**
 * Reduce one period to a comparable side.
 *
 * Rates are **pooled**, not averaged: a period's win rate is total solved over
 * total completed, so a day with one completion counts once rather than as much
 * as a day with sixty. Averaging daily percentages is the classic way to make a
 * quiet Tuesday outvote a whole weekend.
 *
 * Counts keep their day-to-day standard deviation, because for a count metric
 * that spread *is* the thing any difference has to beat.
 */
export function summarise(metric: ExperimentMetric, days: ExperimentDay[]): Side {
  const isRate = RATE_METRICS.includes(metric);
  if (isRate) {
    const { hits, of } = ratioOf(metric, days);
    const r = rate(hits, of);
    return { days: days.length, value: r?.pct ?? null, rate: r, sd: null, n: of };
  }

  // Days before player tracking carry null and are dropped rather than counted
  // as zero — the same "unmeasured is not zero" rule the charts follow.
  const values = days.map((d) => countOn(metric, d)).filter((v): v is number => v !== null);
  if (values.length === 0) return { days: 0, value: null, rate: null, sd: null, n: 0 };
  const total = values.reduce((a, b) => a + b, 0);
  const mean = total / values.length;
  // Sample standard deviation (n-1): these days are a sample of how the metric
  // behaves, not the entire population of days that will ever exist.
  const sd =
    values.length < 2
      ? 0
      : Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1));
  return { days: values.length, value: mean, rate: null, sd, n: total };
}

/**
 * How many days of data each side would need for a {@link TARGET_LIFT} change to
 * clear the noise, minus what the "after" already has.
 *
 * Standard two-sample sizing at 95%/80%, which is a rule of thumb here and not a
 * pre-registered power analysis — the point is the order of magnitude. "About
 * three more weeks" and "about three more months" are different decisions, and
 * either beats refreshing the dashboard daily hoping for a bigger number.
 */
function projectDays(metric: ExperimentMetric, before: Side, after: Side): number | null {
  const z = (Z_ALPHA + Z_BETA) ** 2;
  if (RATE_METRICS.includes(metric)) {
    const p1 = before.rate ? before.rate.pct / 100 : null;
    // A baseline of 0 or 1 has no variance to size against, and no room to move
    // by a relative amount either.
    if (p1 === null || p1 <= 0 || p1 >= 1 || before.days === 0) return null;
    const p2 = Math.min(0.999, p1 * (1 + TARGET_LIFT));
    const needPerGroup = (z * (p1 * (1 - p1) + p2 * (1 - p2))) / (p2 - p1) ** 2;
    // Observations per day, from the before period's own denominator.
    const perDay = before.n / before.days;
    if (perDay <= 0) return null;
    return Math.max(0, Math.ceil(needPerGroup / perDay) - after.days);
  }

  const mean = before.value;
  const sd = before.sd;
  if (mean === null || sd === null || mean <= 0) return null;
  const delta = mean * TARGET_LIFT;
  // A dead-flat baseline needs one day to beat; that's a quirk of a tiny sample,
  // not a real answer, so treat zero spread as unprojectable.
  if (sd <= 0) return null;
  const needDays = (z * 2 * sd ** 2) / delta ** 2;
  return Math.max(0, Math.ceil(needDays) - after.days);
}

/**
 * Compare the window before a ship date against the window from it onward.
 *
 * The ship day itself counts as **after**: a change that went live during a day
 * affected the rest of that day, and putting it in the "before" would blend the
 * two periods it exists to separate.
 *
 * The window is also clipped to `today` — an experiment shipped three days ago
 * has three days of "after", not fourteen, and padding it with days that haven't
 * happened would dilute the very change being looked for.
 *
 * Verdicts:
 * - **inconclusive** when either side is too thin to say anything. This is the
 *   expected answer for the first couple of weeks and it is not a failure.
 * - **no-change** when both sides are measurable and the difference doesn't clear
 *   the noise. Note this is "we couldn't detect a change", never "nothing
 *   happened" — the sensitivity read says how big a change would have shown.
 * - **moved-up / moved-down** only when it does clear.
 */
export function compare(
  metric: ExperimentMetric,
  series: ExperimentDay[],
  shippedOn: string,
  windowDays: number,
  today: string,
): Comparison {
  const isRate = RATE_METRICS.includes(metric);
  const beforeDays = series.filter(
    (d) => d.date < shippedOn && daysBetween(d.date, shippedOn) <= windowDays,
  );
  const afterDays = series.filter(
    (d) => d.date >= shippedOn && d.date <= today && daysBetween(shippedOn, d.date) < windowDays,
  );

  const before = summarise(metric, beforeDays);
  const after = summarise(metric, afterDays);
  const relative =
    before.value === null || after.value === null || before.value === 0
      ? null
      : (after.value - before.value) / before.value;

  const verdict = judge(isRate, before, after);
  return {
    metric,
    isRate,
    before,
    after,
    relative,
    verdict,
    daysNeeded:
      verdict === "no-change" || verdict === "inconclusive" ? projectDays(metric, before, after) : null,
  };
}

/**
 * Did the difference clear the noise?
 *
 * Rates use non-overlapping Wilson intervals (see shared/sample.ts) — a stricter
 * test than a difference-of-proportions, deliberately.
 *
 * Counts use a two-sample t-style comparison of daily means against their pooled
 * spread, at the same 95%. Both sides need at least two days, because one day has
 * no spread and would let any difference look decisive.
 */
function judge(isRate: boolean, before: Side, after: Side): Verdict {
  if (before.value === null || after.value === null) return "inconclusive";

  if (isRate) {
    // A handful of observations can't answer this either way, whatever the
    // intervals happen to do.
    if (before.n < 2 || after.n < 2) return "inconclusive";
    if (!separated(before.rate, after.rate)) return "no-change";
    return after.value > before.value ? "moved-up" : "moved-down";
  }

  if (before.days < 2 || after.days < 2) return "inconclusive";
  const sdB = before.sd ?? 0;
  const sdA = after.sd ?? 0;
  const se = Math.sqrt(sdB ** 2 / before.days + sdA ** 2 / after.days);
  // Two flat periods that differ are a real difference; two flat periods that
  // match are no change. Either way there's nothing to divide by.
  if (se === 0) return before.value === after.value ? "no-change" : after.value > before.value ? "moved-up" : "moved-down";
  const t = (after.value - before.value) / se;
  if (Math.abs(t) < Z_ALPHA) return "no-change";
  return t > 0 ? "moved-up" : "moved-down";
}
