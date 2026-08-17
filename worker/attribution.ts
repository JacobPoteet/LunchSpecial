// Pure arrival-source fold for the admin Players tab: where the audience came
// from, and — the part that matters — whether the people each source sent came
// back. DB-free so it stays unit-testable; the route feeds it the raw visit rows
// (analytics_visits is already one row per device per ET day, so there is
// nothing for SQL to aggregate first).
//
// Three decisions carry this fold:
//
// 1. **A device is attributed to its EARLIEST visit, once.** Acquisition happens
//    once; every later visit is the thing being measured, not another arrival.
//    Counting a device under each source it ever arrived on would let a campaign
//    take credit for people it merely reminded, and the entries would sum to
//    more than the audience.
// 2. **"Returned" is censored, exactly like the repeat-visit curve.** A device
//    only enters a source's denominator once RETENTION_WINDOW_DAYS have passed
//    since it arrived. Without that, a campaign running right now *lowers* its
//    own return rate with every fresh arrival, because those people have not had
//    time to come back yet. The uncounted ones are reported as `pending` rather
//    than dropped or scored as no-shows.
// 3. **NULL source is untracked, never a bucket.** Rows predating
//    migrations/0024 don't say where anyone came from; an untagged arrival since
//    then says `direct`. Folding the first into the second would claim the
//    game's whole history as organic traffic.

import { daysBetween, RETENTION_WINDOW_DAYS } from "./players";
import type { SourceMix, SourceUsage } from "../shared/types";

/** One row of analytics_visits: a single device on a single ET day. */
export interface VisitSourceRow {
  player_id: string;
  visit_day: string;
  /** NULL on visits recorded before migrations/0024; `direct` when untagged since. */
  source: string | null;
}

/** One device's visit days, each carrying the source recorded that day. */
interface Arrival {
  days: { day: string; source: string | null }[];
}

/**
 * Fold visit rows into the all-time arrival mix.
 *
 * `today` is the real current ET day, never a day the dashboard is looking back
 * at: the window asks "has enough time passed *by now* for this person to have
 * come back", and answering it from a past day would call every return since
 * then a no-show. Same rule as `foldRetention` in worker/players.ts.
 *
 * Sorted by arrivals, then by source, so the order doesn't depend on row order.
 * `direct` is not pinned or hidden — it will usually lead, and it should: it is
 * the baseline every campaign is read against.
 *
 * `rows` is consumed exactly once, so a generator is as welcome as an array.
 */
export function foldSources(rows: Iterable<VisitSourceRow>, today: string): SourceMix {
  const byPlayer = new Map<string, Arrival>();

  for (const r of rows) {
    if (!r.player_id || !r.visit_day) continue;
    let arrival = byPlayer.get(r.player_id);
    if (!arrival) {
      arrival = { days: [] };
      byPlayer.set(r.player_id, arrival);
    }
    // The source travels with the day it was recorded on, because the one we
    // want is whichever day turns out to be earliest.
    arrival.days.push({ day: r.visit_day, source: r.source });
  }

  const entries = new Map<string, SourceUsage>();
  let untracked = 0;

  for (const arrival of byPlayer.values()) {
    arrival.days.sort((a, b) => a.day.localeCompare(b.day));
    const { day: first, source } = arrival.days[0];
    if (source === null) {
      untracked += 1;
      continue;
    }
    let entry = entries.get(source);
    if (!entry) {
      entry = {
        source,
        arrivals: 0,
        atRisk: 0,
        returned: 0,
        lateReturned: 0,
        pending: 0,
        firstDay: first,
        lastDay: first,
      };
      entries.set(source, entry);
    }
    entry.arrivals += 1;
    if (first < entry.firstDay) entry.firstDay = first;
    if (first > entry.lastDay) entry.lastDay = first;

    // The next distinct day this device came back on, if any. The rows are one
    // per device-day, so anything after index 0 is a genuinely later day.
    const next = arrival.days[1]?.day;
    if (next !== undefined && daysBetween(first, next) <= RETENTION_WINDOW_DAYS) {
      entry.atRisk += 1;
      entry.returned += 1;
      continue;
    }
    // Not back yet (or not back in time). If their window is still open we can't
    // score them at all — counting them now would read "too recent" as "gone".
    if (daysBetween(first, today) < RETENTION_WINDOW_DAYS) {
      entry.pending += 1;
      continue;
    }
    entry.atRisk += 1;
    if (next !== undefined) entry.lateReturned += 1;
  }

  return {
    entries: [...entries.values()].sort(
      (a, b) => b.arrivals - a.arrivals || a.source.localeCompare(b.source),
    ),
    devices: byPlayer.size,
    untracked,
    windowDays: RETENTION_WINDOW_DAYS,
  };
}
