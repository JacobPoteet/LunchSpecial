// Pure player-funnel folds for the admin dashboard. DB-free so it stays
// unit-testable; the route in routes/admin.ts feeds it raw rows.
//
// Same timezone problem as worker/players.ts and worker/service.ts: started_at
// is stored in UTC and SQLite has no named-timezone support, so rows arrive as
// UTC hour buckets ("YYYY-MM-DD HH") and are folded into ET days here — the same
// midnight-ET boundary the game rolls over on.
//
// The one rule the whole file exists to keep: **every stage counts devices**.
// The dashboard already has a rounds-shaped read of the same journey (see
// FinishRate), and the reason that one is drawn as two tracks rather than a
// funnel is that its rows don't share a unit — a visit is one device per ET day
// while a "start" is a round, so a player doing the Special plus three Leftovers
// is one arrival and four starts. Stacked as funnel stages those numbers grow as
// they descend. Counted in devices each stage is a real subset of the one above,
// which is the only thing that makes a bar's width mean anything.

import { gameToday } from "../shared/time";
import {
  DNF_GRACE_MINUTES,
  type FunnelCounts,
  type FunnelWindow,
  type OpenPlayers,
  type PlayerFunnel,
} from "../shared/types";

/**
 * One (player, UTC hour) group of rounds — the same grouping the new-vs-returning
 * fold reads, with the aggregates the funnel needs added on top, so both folds
 * ride a single query.
 *
 * `first_completed` and `last_started` are raw UTC stamps ("YYYY-MM-DD HH:MM:SS",
 * fixed width), which is what lets the "played again" test be a string compare.
 */
export interface FunnelBucketRow {
  player_id: string;
  /** UTC hour bucket from strftime('%Y-%m-%d %H', started_at). */
  bucket: string;
  started: number;
  completed: number;
  shared: number;
  /** Earliest completion stamp in the group, or null if nothing finished in it. */
  first_completed: string | null;
  /** Latest round start in the group. */
  last_started: string | null;
}

/** What one device did on one ET day, accumulated across its hour buckets. */
interface PlayerDay {
  started: number;
  completed: number;
  shared: number;
  firstCompleted: string | null;
  lastStarted: string | null;
}

const emptyOpen = (): OpenPlayers => ({ inProgress: 0, abandoned: 0 });

const emptyCounts = (): FunnelCounts => ({
  visited: null,
  played: 0,
  finished: 0,
  shared: 0,
  playedAgain: 0,
  open: emptyOpen(),
});

/** "2026-07-24 13:05:02" (UTC) → epoch ms, or null if it doesn't parse. */
function msOf(stamp: string): number | null {
  const t = new Date(`${stamp.replace(" ", "T")}Z`).getTime();
  return Number.isNaN(t) ? null : t;
}

/** "2026-07-24 13" (UTC hour) → the ET day it falls in, or null if unparseable. */
function etDayOf(bucket: string): string | null {
  // Mid-hour keeps us clear of any boundary rounding in either direction.
  const d = new Date(`${bucket.replace(" ", "T")}:30:00Z`);
  return Number.isNaN(d.getTime()) ? null : gameToday(d);
}

/**
 * Roll one ET day's per-device records into stage counts.
 *
 * `playedAgain` is deliberately **ordered**, not just "started two rounds": the
 * question is whether finishing a game made someone want another one, and a
 * player who opens the Special and a Leftover in two tabs before guessing in
 * either has answered nothing. Comparing the day's last start against its first
 * completion is the cheapest test that can only fire when a round began after a
 * game was already over. It's a floor — a device that finishes, replays, and
 * finishes again still counts once, which is what the stage claims.
 *
 * The unfinished remainder is split the same way `foldDayService` splits rounds,
 * against each device's own most recent start, so a live afternoon reads as
 * people eating rather than a mass walkout.
 */
function countStages(players: Iterable<PlayerDay>, nowMs: number): FunnelCounts {
  const counts = emptyCounts();
  const graceMs = DNF_GRACE_MINUTES * 60_000;
  for (const p of players) {
    if (p.started === 0) continue;
    counts.played += 1;
    if (p.completed > 0) counts.finished += 1;
    if (p.shared > 0) counts.shared += 1;
    // Fixed-width UTC stamps, so lexicographic order is chronological order.
    if (p.firstCompleted !== null && p.lastStarted !== null && p.lastStarted > p.firstCompleted) {
      counts.playedAgain += 1;
    }
    if (p.completed === 0) {
      const startedMs = p.lastStarted === null ? null : msOf(p.lastStarted);
      // An unparseable stamp can't be shown any grace it might deserve; a device
      // that has been idle past the grace window isn't coming back either way.
      if (startedMs !== null && nowMs - startedMs <= graceMs) counts.open.inProgress += 1;
      else counts.open.abandoned += 1;
    }
  }
  return counts;
}

/** Add `from`'s stages into `into` — pooling device-days, not de-duplicating devices. */
function addCounts(into: FunnelCounts, from: FunnelCounts): void {
  into.played += from.played;
  into.finished += from.finished;
  into.shared += from.shared;
  into.playedAgain += from.playedAgain;
  into.open.inProgress += from.open.inProgress;
  into.open.abandoned += from.open.abandoned;
}

/**
 * Fold every tracked round into the funnel for `day` and the pooled funnel for
 * every day arrivals have been measured on.
 *
 * `visitsByDay` is already keyed by ET day — the beacon handler stamps it, so
 * unlike the round rows it needs no conversion. Its earliest key is when the
 * instrument switched on: days before that recorded rounds while nobody counted
 * arrivals, and reporting them as 0 visitors would claim a 100% bounce rate for
 * the whole of the game's history. Those days get `visited: null`, and the
 * pooled window starts at the boundary rather than reaching past it — pooling
 * earlier days would keep their plays and drop their visitors, flattering the
 * top of the funnel exactly as much as it understated the bounce.
 *
 * The pooled window covers days that saw *either* arrivals or plays. A day with
 * visitors and no games is the loudest signal this chart can carry, and dropping
 * it for having no rounds would delete exactly the days worth looking at.
 */
export function foldFunnel(
  rows: Iterable<FunnelBucketRow>,
  visitsByDay: Map<string, number>,
  day: string,
  now: Date = new Date(),
): PlayerFunnel {
  const byDay = new Map<string, Map<string, PlayerDay>>();
  for (const r of rows) {
    const et = etDayOf(r.bucket);
    if (et === null) continue;
    let players = byDay.get(et);
    if (!players) {
      players = new Map();
      byDay.set(et, players);
    }
    let p = players.get(r.player_id);
    if (!p) {
      p = { started: 0, completed: 0, shared: 0, firstCompleted: null, lastStarted: null };
      players.set(r.player_id, p);
    }
    p.started += r.started;
    p.completed += r.completed;
    p.shared += r.shared;
    if (r.first_completed && (p.firstCompleted === null || r.first_completed < p.firstCompleted)) {
      p.firstCompleted = r.first_completed;
    }
    if (r.last_started && (p.lastStarted === null || r.last_started > p.lastStarted)) {
      p.lastStarted = r.last_started;
    }
  }

  const nowMs = now.getTime();
  const since = [...visitsByDay.keys()].sort()[0] ?? null;

  const dayCounts = countStages(byDay.get(day)?.values() ?? [], nowMs);
  dayCounts.visited = since !== null && day >= since ? (visitsByDay.get(day) ?? 0) : null;

  const pooledDays = new Set<string>();
  for (const d of byDay.keys()) if (since === null || d >= since) pooledDays.add(d);
  for (const d of visitsByDay.keys()) pooledDays.add(d);

  const allTime: FunnelWindow = { ...emptyCounts(), days: pooledDays.size, since };
  let visitedTotal = 0;
  for (const d of pooledDays) {
    const players = byDay.get(d);
    if (players) addCounts(allTime, countStages(players.values(), nowMs));
    visitedTotal += visitsByDay.get(d) ?? 0;
  }
  allTime.visited = since === null ? null : visitedTotal;

  return { day: dayCounts, allTime };
}
