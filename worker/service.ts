// Pure per-day ("one service") analytics folds for the admin overview. DB-free
// so it stays unit-testable; the route in routes/admin.ts feeds it raw rows.
//
// Same timezone problem as worker/players.ts: started_at is stored in UTC and
// SQLite has no named-timezone support, so rows arrive as UTC hour buckets
// ("YYYY-MM-DD HH") and get folded into ET days *and hours* here — the same
// midnight-ET boundary the game rolls over on. A UTC hour maps cleanly onto one
// ET hour because the offset is whole hours in both DST phases.

import { gameHour, gameToday } from "../shared/time";
import {
  PACE_LOOKBACK_DAYS,
  type AnalyticsHour,
  type AnalyticsPace,
  type DayServiceTotals,
  type RoundKind,
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
 */
export function foldDayService(rows: Iterable<DayHourRow>, day: string): DayService {
  const hourly = emptyHours();
  const allKinds: DayServiceTotals = { started: 0, completed: 0, solved: 0, shared: 0 };
  let lastStartedAt: string | null = null;

  for (const r of rows) {
    const instant = instantOf(r.bucket);
    if (instant === null || gameToday(instant) !== day) continue;

    const slot = hourly[gameHour(instant)];
    if (slot && r.kind in slot.startedByKind) slot.startedByKind[r.kind] += r.started;

    allKinds.started += r.started;
    allKinds.completed += r.completed;
    allKinds.solved += r.solved;
    allKinds.shared += r.shared;

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
  };
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
