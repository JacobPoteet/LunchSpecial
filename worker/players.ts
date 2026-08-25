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

import { daysBetween, gameToday } from "../shared/time";
import type { PlayerRetention, PlayerSplit, RetentionStep } from "../shared/types";

/**
 * How long a player gets to come back before we call the visit their last.
 *
 * Seven days is a judgement call, but the *shape* of the rule isn't: every
 * player in a retention denominator must have had the **same** amount of time to
 * return, or the number drifts with the age of the audience rather than with the
 * game. See {@link foldRetention}.
 */
export const RETENTION_WINDOW_DAYS = 7;

/** How many visit→visit steps to compute. Beyond ~5 the cohorts are a handful of regulars. */
export const MAX_RETENTION_STEPS = 5;

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
   * Every player's active ET days, oldest first — their "visits". One entry per
   * day no matter how many rounds they played in it, because in a daily game the
   * unit that means "came back" is the day, not the round: four leftovers in one
   * sitting is one visit, the same way a diner counts covers and not courses.
   */
  visitDays: Map<string, string[]>;
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
  const visitDays = new Map<string, string[]>();
  for (const [player, days] of activeDaysByPlayer) {
    const sorted = [...days].sort();
    visitDays.set(player, sorted);
    const [first, ...later] = sorted;
    bump(first, "new");
    allTimeNew += 1;
    for (const d of later) bump(d, "returning");
    if (later.length > 0) allTimeReturning += 1;
    if (firstDay === null || first < firstDay) firstDay = first;
  }

  return { byDay, visitDays, allTime: { new: allTimeNew, returning: allTimeReturning }, firstDay };
}

// Lives in shared/time.ts so the admin's dish filters can measure rest with the
// same primitive; re-exported here because this module's callers already had it.
// `import` + `export`, not `export … from`: this file uses it too, and a bare
// re-export creates no local binding.
export { daysBetween };

/**
 * The repeat-visit curve: after a player's 1st visit, how often is there a 2nd?
 * After the 2nd, a 3rd? This is the restaurant read — a first-timer is a coin
 * flip, but a guest who has come three times is a regular — and it separates
 * "people try it" from "people keep it".
 *
 * Step k's cohort is players with **at least k visits**, and it asks how many
 * made visit k+1. Two things keep that from lying:
 *
 * 1. **Censoring.** A player whose k-th visit was yesterday hasn't had a chance
 *    to come back, and counting them as a no-show would drag every rate down —
 *    worse, it would drag them down *more* the better the week was, because a
 *    busy week adds fresh players who can't have returned yet. So a player only
 *    enters step k's denominator once {@link RETENTION_WINDOW_DAYS} have passed
 *    since their k-th visit. The ones still inside their window are reported as
 *    `pending` rather than silently dropped.
 * 2. **A fixed window, not "ever".** `returned` counts a next visit within the
 *    window. If it counted any later visit, a player from launch week would have
 *    had months to come back while one who matured yesterday had seven days, and
 *    the pooled rate would measure the age of the audience. Genuine slow returns
 *    aren't thrown away — they land in `lateReturned`, which is the interesting
 *    "they came back, just not that week" number.
 *
 * Returns null before player tracking existed (migrations/0008): with no
 * `player_id` there are no visits to chain, and zeros would be a claim we never
 * measured. Note the cohorts are only as old as the instrument — a device that
 * played for weeks before tracking shipped enters here as a first-timer, so the
 * earliest players understate their own visit counts.
 */
export function foldRetention(
  activity: PlayerActivity,
  today: string,
  trackingStart: string | null,
): PlayerRetention | null {
  if (trackingStart === null) return null;

  const steps: RetentionStep[] = [];
  for (let k = 1; k <= MAX_RETENTION_STEPS; k++) {
    const step: RetentionStep = { visits: k, atRisk: 0, returned: 0, lateReturned: 0, pending: 0 };
    for (const visits of activity.visitDays.values()) {
      if (visits.length < k) continue;
      const kth = visits[k - 1];
      // Still inside their window: the question hasn't been answered yet, so
      // they're neither a return nor a no-show.
      if (daysBetween(kth, today) < RETENTION_WINDOW_DAYS) {
        step.pending += 1;
        continue;
      }
      step.atRisk += 1;
      const next = visits[k];
      if (next === undefined) continue;
      if (daysBetween(kth, next) <= RETENTION_WINDOW_DAYS) step.returned += 1;
      else step.lateReturned += 1;
    }
    // Nobody has reached this many visits yet; no later step can either.
    if (step.atRisk === 0 && step.pending === 0) break;
    steps.push(step);
  }

  return { windowDays: RETENTION_WINDOW_DAYS, steps };
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
