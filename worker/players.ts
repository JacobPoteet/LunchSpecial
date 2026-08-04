// Pure new-vs-returning player logic for the admin analytics. DB-free so it
// stays unit-testable; the route in routes/admin.ts feeds it raw rows.
//
// Two things make this less trivial than it looks:
//
// 1. started_at is stored in UTC and SQLite has no named-timezone support, so
//    rows arrive as UTC hour buckets ("YYYY-MM-DD HH") and get folded into ET
//    days here — the same midnight-ET boundary the game rolls over on.
// 2. player_id only exists from migrations/0008 onward (shipped v1.3.0), and the
//    game launched before it. Days before that recorded rounds but no players,
//    so their split is *unmeasured*, not zero — playersOn() returns null for
//    them and the dashboard renders a gap rather than a line pinned to 0.
//
// The tracking start is derived from the data (the earliest tracked row) rather
// than hardcoded, so it survives a backfill and can't rot.

import { gameToday } from "../shared/time";
import type { PlayerSplit } from "../shared/types";

/** One (player, active UTC hour) pair — the grouped shape the query returns. */
export interface PlayerBucketRow {
  player_id: string;
  /** UTC hour bucket from strftime('%Y-%m-%d %H', started_at). */
  bucket: string;
}

export interface PlayerActivity {
  /** Per-ET-day new/returning tallies. Days with no tracked activity are absent. */
  byDay: Map<string, PlayerSplit>;
  /**
   * Across every folded row: `new` = distinct players ever seen, `returning` =
   * those active on at least one day after their first.
   */
  allTime: PlayerSplit;
  /** Earliest ET day these rows cover, or null when there are none. */
  firstDay: string | null;
}

/**
 * "2026-07-24 13" (UTC hour) → the ET day that hour falls in, or null if it
 * doesn't parse. Rebuilt at mid-hour to stay clear of boundary rounding.
 */
export function etDayOfHourBucket(bucket: string): string | null {
  return etDay(`${bucket.replace(" ", "T")}:30:00Z`);
}

/** "2026-07-24 13:05:22" (UTC instant) → the ET day it falls in, or null. */
export function etDayOfUtcStamp(stamp: string): string | null {
  return etDay(`${stamp.replace(" ", "T")}Z`);
}

function etDay(iso: string): string | null {
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? null : gameToday(instant);
}

/**
 * Fold (player, UTC hour) rows into per-ET-day new/returning counts. A player's
 * earliest ET day is where they count as new; every later active day counts them
 * as returning once.
 */
export function foldPlayerActivity(rows: Iterable<PlayerBucketRow>): PlayerActivity {
  const activeDaysByPlayer = new Map<string, Set<string>>();
  for (const r of rows) {
    const et = etDayOfHourBucket(r.bucket);
    if (et === null) continue;
    let set = activeDaysByPlayer.get(r.player_id);
    if (!set) {
      set = new Set();
      activeDaysByPlayer.set(r.player_id, set);
    }
    set.add(et);
  }

  const byDay = new Map<string, PlayerSplit>();
  const bump = (date: string, key: keyof PlayerSplit) => {
    let split = byDay.get(date);
    if (!split) {
      split = { new: 0, returning: 0 };
      byDay.set(date, split);
    }
    split[key] += 1;
  };

  let allTimeNew = 0;
  let allTimeReturning = 0;
  let firstDay: string | null = null;
  for (const days of activeDaysByPlayer.values()) {
    const sorted = [...days].sort();
    const [first, ...later] = sorted;
    bump(first, "new");
    allTimeNew += 1;
    for (const d of later) bump(d, "returning");
    if (later.length > 0) allTimeReturning += 1;
    if (firstDay === null || first < firstDay) firstDay = first;
  }

  return { byDay, allTime: { new: allTimeNew, returning: allTimeReturning }, firstDay };
}

/**
 * One ET day's split, or **null when the day predates player tracking** — the
 * distinction the charts exist to preserve. A tracked day with nobody on it is a
 * real `{ new: 0, returning: 0 }`; an untracked day is not a zero at all.
 *
 * `trackingStart` is passed in rather than taken from `activity.firstDay` because
 * the activity rows are surface-filtered: with the Discord filter on, the first
 * *Discord* player might be weeks after instrumentation shipped, and greying out
 * the gap would claim those days went unmeasured when they simply had no Discord
 * players. Instrumentation start is global.
 */
export function playersOn(
  activity: PlayerActivity,
  date: string,
  trackingStart: string | null,
): PlayerSplit | null {
  if (trackingStart === null || date < trackingStart) return null;
  return activity.byDay.get(date) ?? { new: 0, returning: 0 };
}

/**
 * The all-time split, or null when nothing has ever been tracked. Note this is
 * "distinct players since `trackingStart`", not since launch — players from
 * before instrumentation are invisible until they come back, and then they're
 * counted as new. The dashboard says so next to the number.
 */
export function playersAllTime(activity: PlayerActivity, trackingStart: string | null): PlayerSplit | null {
  return trackingStart === null ? null : activity.allTime;
}
