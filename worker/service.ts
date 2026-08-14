// Pure per-day ("one service") analytics folds for the admin overview. DB-free
// so it stays unit-testable; the route in routes/admin.ts feeds it raw rows.
//
// Same timezone problem as worker/players.ts: started_at is stored in UTC and
// SQLite has no named-timezone support, so rows arrive as UTC hour buckets
// ("YYYY-MM-DD HH") and get folded into ET days *and hours* here — the same
// midnight-ET boundary the game rolls over on. A UTC hour maps cleanly onto one
// ET hour because the offset is whole hours in both DST phases.

import { medianOf, percentileOf } from "../shared/sample";
import { gameHour, gameToday } from "../shared/time";
import {
  DNF_GRACE_MINUTES,
  PACE_LOOKBACK_DAYS,
  PLAYTIME_CAP_MINUTES,
  type AnalyticsHour,
  type AnalyticsPace,
  type DayServiceTotals,
  type OpenRounds,
  type PlayTime,
  type RoundKind,
  type SolveTimes,
  type StartedByKind,
} from "../shared/types";

const HOURS = 24;

const zeroByKind = (): StartedByKind => ({ daily: 0, leftover: 0, random: 0 });

/**
 * One (UTC hour, kind) group for a single day's ±1-day window. `last_started` is
 * the newest raw `started_at` in the group, which the fold uses to find the whole
 * day's most recent round.
 */
export interface DayHourRow {
  bucket: string;
  kind: RoundKind;
  started: number;
  completed: number;
  solved: number;
  shared: number;
  last_started: string | null;
}

/** One (UTC hour, kind) group from the multi-day series — only `started` is used. */
export interface PaceRow {
  bucket: string;
  started: number;
}

export interface DayService {
  hourly: AnalyticsHour[];
  allKinds: DayServiceTotals;
  lastStartedAt: string | null;
  /** The started-but-never-finished gap, split by whether it still could finish. */
  open: OpenRounds;
}

/** "2026-07-24 13" (UTC hour) → the instant mid-hour, or null if it doesn't parse. */
function instantOf(bucket: string): Date | null {
  // Mid-hour keeps us clear of any boundary rounding in either direction.
  const d = new Date(`${bucket.replace(" ", "T")}:30:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** An empty 24-hour frame — every hour present, so the chart has no gaps to special-case. */
function emptyHours(): AnalyticsHour[] {
  return Array.from({ length: HOURS }, (_, hour) => ({ hour, startedByKind: zeroByKind() }));
}

/**
 * Fold one day's (UTC hour, kind) groups into its ET hour profile and totals.
 *
 * The query hands us a ±1-day UTC window because a single ET day straddles two
 * UTC ones; rows landing outside the target ET day are dropped here rather than
 * in SQL, which can't do the conversion.
 *
 * `now` is what splits the started-but-unfinished gap into people still playing
 * and people who left. Each row is a cohort of rounds that *started* in one hour,
 * so the whole cohort is at least as old as the end of its hour; once that is
 * more than {@link DNF_GRACE_MINUTES} ago, a round still open isn't coming back.
 * The dashboard used to report the entire gap as DNF and clamp it at zero, which
 * on a live afternoon reads a full diner as a walkout.
 */
export function foldDayService(rows: Iterable<DayHourRow>, day: string, now: Date = new Date()): DayService {
  const hourly = emptyHours();
  const allKinds: DayServiceTotals = { started: 0, completed: 0, solved: 0, shared: 0 };
  const open: OpenRounds = { inProgress: 0, abandoned: 0 };
  let lastStartedAt: string | null = null;
  const graceMs = DNF_GRACE_MINUTES * 60_000;

  for (const r of rows) {
    const instant = instantOf(r.bucket);
    if (instant === null || gameToday(instant) !== day) continue;

    const slot = hourly[gameHour(instant)];
    if (slot && r.kind in slot.startedByKind) slot.startedByKind[r.kind] += r.started;

    allKinds.started += r.started;
    allKinds.completed += r.completed;
    allKinds.solved += r.solved;
    allKinds.shared += r.shared;

    // Within a start cohort `completed` can't exceed `started` — a completion
    // whose /start never landed still writes started_at into this same bucket —
    // but the floor costs nothing and a negative would poison the split.
    const still = Math.max(0, r.started - r.completed);
    if (still > 0) {
      // instantOf() puts us mid-hour, so the hour ends 30 minutes later.
      const cohortEndedMs = instant.getTime() + 30 * 60_000;
      if (now.getTime() - cohortEndedMs > graceMs) open.abandoned += still;
      else open.inProgress += still;
    }

    // Lexicographic max is chronological max: "YYYY-MM-DD HH:MM:SS", fixed width, UTC.
    if (r.last_started && (lastStartedAt === null || r.last_started > lastStartedAt)) {
      lastStartedAt = r.last_started;
    }
  }

  return {
    hourly,
    allKinds,
    // Hand the client a real instant so it can render the time in any zone.
    lastStartedAt: lastStartedAt === null ? null : `${lastStartedAt.replace(" ", "T")}Z`,
    open,
  };
}

/**
 * One grouped row of round durations: how many finished rounds took `minutes`.
 *
 * Covers every finished round, won or lost — `solved` is what narrows it back to
 * the solve-time read. One query, two folds: how long a *solve* takes is a
 * difficulty signal and a loss would flatter it, while total play time is time
 * spent at the counter and six wrong guesses is exactly that.
 */
export interface SolveTimeRow {
  minutes: number | null;
  solved: number;
  n: number;
}

/**
 * Fold solve durations into a median and a p90.
 *
 * Never a mean. A round is a browser tab: most are finished in a couple of
 * minutes, and a handful are opened at breakfast and finished at lunch. Those are
 * real rows — the game genuinely was open — but one of them moves an average by
 * more than a hundred normal rounds do, so the typical figure has to be a
 * position in the distribution rather than its centre of mass.
 *
 * Negative durations are dropped rather than clamped: they can only come from a
 * completion whose `/start` beacon arrived late enough to overwrite nothing, and
 * a "-3 minute" solve is a broken measurement, not a fast one.
 */
export function foldSolveTimes(rows: Iterable<SolveTimeRow>): SolveTimes {
  const pairs: [number, number][] = [];
  let count = 0;
  for (const r of rows) {
    if (!timed(r) || r.solved !== 1) continue;
    pairs.push([r.minutes as number, r.n]);
    count += r.n;
  }
  return {
    count,
    medianMinutes: medianOf(pairs),
    p90Minutes: percentileOf(pairs, 0.9),
  };
}

/** A row that measured something: a real, non-negative duration over ≥1 round. */
function timed(r: SolveTimeRow): boolean {
  return r.minutes !== null && Number.isFinite(r.minutes) && r.minutes >= 0 && r.n > 0;
}

/**
 * Fold the same durations into one total — how much time the game has taken up.
 *
 * Every round counts at no more than {@link PLAYTIME_CAP_MINUTES}, and that cap
 * is the only thing making a sum honest here. `completed_at - started_at`
 * measures a browser tab, so the tail of the distribution is people who wandered
 * off mid-round: the median round in prod is a couple of minutes and the longest
 * is nearly two hours. A median shrugs that off by dividing it away; a total
 * would hand a single abandoned tab more weight than fifty real games.
 *
 * Won and lost rounds both count — running out of guesses is time spent playing.
 * Rounds that never finished can't be counted at all, since only a completion
 * writes the second timestamp, so this is a floor on time played, never a ceiling.
 */
export function foldPlayTime(rows: Iterable<SolveTimeRow>, cap: number = PLAYTIME_CAP_MINUTES): PlayTime {
  let minutes = 0;
  let rounds = 0;
  let capped = 0;
  for (const r of rows) {
    if (!timed(r)) continue;
    const m = r.minutes as number;
    rounds += r.n;
    minutes += Math.min(m, cap) * r.n;
    if (m > cap) capped += r.n;
  }
  return { minutes, rounds, capped };
}

/**
 * Build the pace baseline for `day`: the mean cumulative games-started curve
 * across the most recent {@link PACE_LOOKBACK_DAYS} active ET days *before* it.
 *
 * Three deliberate choices:
 *
 * - **Strictly earlier days.** Folding the day into its own baseline would drag
 *   the comparison toward itself and mute exactly the deviation we're looking for.
 * - **Active days only.** Days with no rounds at all aren't quiet days, they're
 *   days the game wasn't being played (or wasn't yet deployed); averaging zeros
 *   in would make every live day look like a runaway success.
 * - **Cumulative, not per-hour.** The dashboard asks "are we ahead of pace *by
 *   now*", which is a running total, and per-hour means are far noisier at the
 *   volumes this game sees.
 *
 * Returns null when no earlier active day is in range — a baseline of one day is
 * a comparison to a single sample, but it's still more honest than nothing, so
 * the count travels with it and the UI says how many days it averaged.
 */
export function foldPace(
  rows: Iterable<PaceRow>,
  day: string,
  lookback: number = PACE_LOOKBACK_DAYS,
): AnalyticsPace | null {
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    const instant = instantOf(r.bucket);
    if (instant === null) continue;
    const et = gameToday(instant);
    if (et >= day) continue; // strictly earlier days only
    let hours = byDay.get(et);
    if (!hours) {
      hours = Array.from({ length: HOURS }, () => 0);
      byDay.set(et, hours);
    }
    hours[gameHour(instant)] += r.started;
  }

  const days = [...byDay.keys()].sort().slice(-lookback);
  if (days.length === 0) return null;

  const typical = Array.from({ length: HOURS }, () => 0);
  for (const d of days) {
    const hours = byDay.get(d)!;
    let running = 0;
    for (let h = 0; h < HOURS; h++) {
      running += hours[h];
      typical[h] += running;
    }
  }
  for (let h = 0; h < HOURS; h++) typical[h] /= days.length;

  return { days: days.length, typical };
}
