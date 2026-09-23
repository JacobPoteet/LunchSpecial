// Pure audience folds: weekly active devices, the cohort grid and the
// first-visit funnel. DB-free so it stays unit-testable; the route in
// routes/admin/analytics.ts feeds it raw rows.
//
// Same timezone rule as worker/players.ts: round rows arrive as UTC hour buckets
// and are folded into ET days here. Visit rows are already ET days (the beacon
// handler stamps them).
//
// "Active" means **played** — started a round on that ET day. The visit beacon
// shipped weeks after `player_id`, so an arrival-based count would jump on the
// day it switched on and read as a launch. Arrivals only appear in the funnel,
// which is clipped to the days they were measured on.

import { addDays, daysBetween } from "../shared/time";
import { SURFACES } from "../shared/types";
import type {
  ActiveWindow,
  ArrivalFunnel,
  AudienceReport,
  AudienceSlice,
  CameBack,
  Surface,
  WeeklyActive,
  WeeklyCohort,
} from "../shared/types";
import { RETENTION_WINDOW_DAYS, etDayOfHourBucket } from "./players";

/** How many weeks after the first the cohort grid follows a cohort. Past this the rows are a handful of regulars. */
export const MAX_COHORT_WEEKS = 8;

/** One (player, surface, UTC hour) group of rounds. */
export interface AudienceRoundRow {
  player_id: string;
  surface: string;
  /** UTC hour bucket from strftime('%Y-%m-%d %H', started_at). */
  bucket: string;
  started: number;
  completed: number;
  shared: number;
}

/** One arrival: a device on an ET day. */
export interface AudienceVisitRow {
  player_id: string;
  surface: string;
  visit_day: string;
}

interface DayPlay {
  started: number;
  completed: number;
  shared: number;
}

/** The Monday that opens the week `day` sits in. ET days are plain calendar days, so UTC parsing is safe. */
export function weekStartOf(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

const emptyCameBack = (): CameBack => ({ returned: 0, atRisk: 0, pending: 0 });
const emptyFunnel = (): ArrivalFunnel => ({
  arrived: 0,
  played: 0,
  finished: 0,
  shared: 0,
  cameBack: { ifPlayed: emptyCameBack(), ifBounced: emptyCameBack() },
});

const minOf = (days: Iterable<string>): string | null => {
  let min: string | null = null;
  for (const d of days) if (min === null || d < min) min = d;
  return min;
};

function windowOf(
  played: Map<string, Map<string, DayPlay>>,
  firstPlayed: Map<string, string>,
  from: string,
  to: string,
): ActiveWindow {
  const w: ActiveWindow = { from, to, active: 0, new: 0, returning: 0 };
  for (const [player, days] of played) {
    let seen = false;
    for (const d of days.keys()) {
      if (d >= from && d <= to) {
        seen = true;
        break;
      }
    }
    if (!seen) continue;
    w.active += 1;
    if (firstPlayed.get(player)! >= from) w.new += 1;
    else w.returning += 1;
  }
  return w;
}

/**
 * One surface's (or every surface's) slice. Called once per slice with rows
 * already filtered, so a device is only ever compared with its own surface.
 */
export function foldAudienceSlice(
  rounds: Iterable<AudienceRoundRow>,
  visits: Iterable<AudienceVisitRow>,
  today: string,
  trackingStart: string | null,
  visitsSince: string | null,
): AudienceSlice {
  const played = new Map<string, Map<string, DayPlay>>();
  for (const r of rounds) {
    const day = etDayOfHourBucket(r.bucket);
    if (day === null || r.started <= 0) continue;
    let days = played.get(r.player_id);
    if (!days) {
      days = new Map();
      played.set(r.player_id, days);
    }
    const p = days.get(day) ?? { started: 0, completed: 0, shared: 0 };
    p.started += r.started;
    p.completed += r.completed;
    p.shared += r.shared;
    days.set(day, p);
  }

  const visitDays = new Map<string, Set<string>>();
  for (const v of visits) {
    let set = visitDays.get(v.player_id);
    if (!set) {
      set = new Set();
      visitDays.set(v.player_id, set);
    }
    set.add(v.visit_day);
  }

  const firstPlayed = new Map<string, string>();
  for (const [player, days] of played) firstPlayed.set(player, minOf(days.keys())!);

  // --- KPI windows: the last seven *complete* days, and the seven before.
  const lastWeek = windowOf(played, firstPlayed, addDays(today, -7), addDays(today, -1));
  const priorWeek = windowOf(played, firstPlayed, addDays(today, -14), addDays(today, -8));

  // --- Weekly active, new vs returning.
  const weeks: WeeklyActive[] = [];
  const cohorts: WeeklyCohort[] = [];
  if (trackingStart !== null) {
    const firstWeek = weekStartOf(trackingStart);
    const thisWeek = weekStartOf(today);
    const byWeek = new Map<string, { new: Set<string>; returning: Set<string> }>();
    const playedWeeks = new Map<string, Set<string>>();
    for (const [player, days] of played) {
      const cohortWeek = weekStartOf(firstPlayed.get(player)!);
      const set = new Set<string>();
      for (const d of days.keys()) set.add(weekStartOf(d));
      playedWeeks.set(player, set);
      for (const w of set) {
        let bucket = byWeek.get(w);
        if (!bucket) {
          bucket = { new: new Set(), returning: new Set() };
          byWeek.set(w, bucket);
        }
        (w === cohortWeek ? bucket.new : bucket.returning).add(player);
      }
    }
    for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
      const b = byWeek.get(w);
      weeks.push({
        weekStart: w,
        new: b?.new.size ?? 0,
        returning: b?.returning.size ?? 0,
        daysElapsed: Math.min(7, daysBetween(w, today) + 1),
        firstTracked: w === firstWeek,
      });
    }

    // --- Cohort grid. A later week only gets a number once it has fully run.
    const sizes = new Map<string, number>();
    const backs = new Map<string, number[]>();
    for (const [player, weeksPlayed] of playedWeeks) {
      const c = weekStartOf(firstPlayed.get(player)!);
      sizes.set(c, (sizes.get(c) ?? 0) + 1);
      let back = backs.get(c);
      if (!back) {
        back = Array.from({ length: MAX_COHORT_WEEKS }, () => 0);
        backs.set(c, back);
      }
      for (let k = 1; k <= MAX_COHORT_WEEKS; k++) {
        if (weeksPlayed.has(addDays(c, 7 * k))) back[k - 1] += 1;
      }
    }
    for (let c = firstWeek; c <= thisWeek; c = addDays(c, 7)) {
      const size = sizes.get(c) ?? 0;
      if (size === 0) continue;
      const counts = backs.get(c)!;
      const back: (number | null)[] = [];
      for (let k = 1; k <= MAX_COHORT_WEEKS; k++) {
        const target = addDays(c, 7 * k);
        if (target > thisWeek) break;
        // Finished weeks only: the week's Sunday has to be behind today.
        back.push(addDays(target, 6) < today ? counts[k - 1] : null);
      }
      cohorts.push({ weekStart: c, size, back, firstTracked: c === firstWeek });
    }
  }

  // --- The arrival funnel, split by whether it was the device's first day.
  const firstVisit = emptyFunnel();
  const returning = emptyFunnel();
  if (visitsSince !== null) {
    for (const [player, days] of visitDays) {
      const playedDays = played.get(player);
      const firstSeen = minOf([...days, ...(playedDays?.keys() ?? [])])!;
      // Every day this device showed up at all, for "did it come back".
      const seen = new Set<string>([...days, ...(playedDays?.keys() ?? [])]);
      for (const day of days) {
        if (day < visitsSince) continue;
        const isFirst = day === firstSeen;
        const f = isFirst ? firstVisit : returning;
        const p = playedDays?.get(day);
        f.arrived += 1;
        if (p) f.played += 1;
        if (p && p.completed > 0) f.finished += 1;
        if (p && p.shared > 0) f.shared += 1;
        if (!isFirst) continue;
        const cb = p ? f.cameBack.ifPlayed : f.cameBack.ifBounced;
        if (daysBetween(day, today) < RETENTION_WINDOW_DAYS) {
          cb.pending += 1;
          continue;
        }
        cb.atRisk += 1;
        for (let k = 1; k <= RETENTION_WINDOW_DAYS; k++) {
          if (seen.has(addDays(day, k))) {
            cb.returned += 1;
            break;
          }
        }
      }
    }
  }

  return { lastWeek, priorWeek, weeks, cohorts, firstVisit, returning };
}

/** Every slice at once: all surfaces pooled, then each surface on its own. */
export function foldAudience(
  rounds: AudienceRoundRow[],
  visits: AudienceVisitRow[],
  today: string,
  trackingStart: string | null,
): AudienceReport {
  const visitsSince = minOf(visits.map((v) => v.visit_day));
  const slice = (s: Surface | null) =>
    foldAudienceSlice(
      s === null ? rounds : rounds.filter((r) => r.surface === s),
      s === null ? visits : visits.filter((v) => v.surface === s),
      today,
      trackingStart,
      visitsSince,
    );
  const bySurface = { all: slice(null) } as AudienceReport["bySurface"];
  for (const s of SURFACES) bySurface[s] = slice(s);
  return { today, trackingStart, visitsSince, bySurface };
}
