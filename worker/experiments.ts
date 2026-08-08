// Pure daily-series fold for the admin Experiments tab: every raw number a
// before/after comparison might need, one row per ET day, no gaps. DB-free so it
// stays unit-testable; the route in routes/admin.ts feeds it the same all-time
// hour buckets the growth curve and the rhythm grid already read.
//
// The comparison itself lives in shared/experiment.ts — this module only shapes
// the data. The split is deliberate: windowing and statistics happen on the
// client so the tab can re-window any experiment without a round trip, which
// means the maths has to be shared code, which means it can't touch the DB.
//
// Same timezone problem as everywhere else here: started_at is UTC, SQLite has no
// named timezones, so rows arrive as UTC hour buckets and are folded into ET days
// against the midnight-ET boundary the game rolls over on.

import { gameToday } from "../shared/time";
import type { ExperimentDay } from "../shared/types";
import type { PlayerActivity } from "./players";

/** One all-time UTC hour bucket with its outcome sums. */
export interface ExperimentHourRow {
  bucket: string;
  started: number;
  completed: number;
  solved: number;
  shared: number;
}

/** "2026-07-24" → "2026-07-25". Plain calendar arithmetic on an ET day. */
function nextDate(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Fold hour buckets into a continuous per-ET-day series from the first recorded
 * round through today.
 *
 * Three things the caller can't do in SQL:
 *
 * - **Filling the quiet days.** Every calendar day in the span gets a row, zeros
 *   included. A comparison window is defined in *days*, so a missing day would
 *   silently shorten one side of it — and a dead day inside an "after" period is
 *   the most important observation there is.
 * - **Raw counts, never rates.** A period's win rate is total solved over total
 *   completed; a per-day percentage can't be re-pooled over a different window,
 *   and averaging daily percentages lets a one-round Tuesday outvote a weekend.
 *   So the rate metrics ship as their two components and get divided later.
 * - **Player counts are null before tracking existed**, not zero — the same rule
 *   the charts follow. `summarise()` in shared/experiment.ts drops those days
 *   rather than averaging them in as zeros, which would invent a cliff at the
 *   instrument's start date and let any experiment near it look like a triumph.
 */
export function foldExperimentSeries(
  rows: Iterable<ExperimentHourRow>,
  today: string,
  activity: PlayerActivity,
  trackingStart: string | null,
): ExperimentDay[] {
  type Totals = Pick<ExperimentDay, "started" | "completed" | "solved" | "shared">;
  const byDay = new Map<string, Totals>();

  for (const r of rows) {
    // Rebuilt at mid-hour to stay clear of boundary rounding, as everywhere else.
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    const et = gameToday(instant);
    // started_at is server-written, so a day after today can't be real.
    if (et > today) continue;
    let acc = byDay.get(et);
    if (!acc) {
      acc = { started: 0, completed: 0, solved: 0, shared: 0 };
      byDay.set(et, acc);
    }
    acc.started += r.started;
    acc.completed += r.completed;
    acc.solved += r.solved;
    acc.shared += r.shared;
  }

  const dates = [...byDay.keys()].sort();
  if (dates.length === 0) return [];

  const series: ExperimentDay[] = [];
  for (let d = dates[0]; d <= today; d = nextDate(d)) {
    const totals = byDay.get(d) ?? { started: 0, completed: 0, solved: 0, shared: 0 };
    // A tracked day with nobody on it is a real zero; a day before the instrument
    // existed is not a measurement at all.
    const tracked = trackingStart !== null && d >= trackingStart;
    const split = activity.byDay.get(d);
    series.push({
      date: d,
      ...totals,
      players: tracked ? (split ? split.new + split.returning : 0) : null,
      newPlayers: tracked ? (split?.new ?? 0) : null,
    });
  }
  return series;
}
