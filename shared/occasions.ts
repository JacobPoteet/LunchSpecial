// Occasions: the days the diner dresses up — PURE.
//
// An occasion is a costume the game wears for a stretch of the calendar
// (Halloween is the first). Every costume is handcrafted in
// src/occasions/<id>/; this module only decides WHEN one is worn, and the
// dashboard only decides when, never what.
//
// Two sources answer "when", in this order:
//
//   1. Bookings made in /admin (`occasion_bookings`). A booking that covers the
//      day and is live puts the occasion on.
//   2. The occasion's own window in code (`OCCASIONS[id].from/to`, every
//      year). It runs unless a booking for that occasion touches the same
//      season, in which case the bookings speak for the whole season. That is
//      how /admin shortens, shifts or switches off a year's Halloween without
//      the default creeping back in around the edges.
//
// So a holiday turns up on time with nobody opening /admin, the same way an
// unbooked day still gets a Special from the fallback pick.
//
// The day is the round's own day, fixed at entry: the puzzle date for lunch
// (so a Leftover from Oct 31 replays in costume) and the night key for the bar.
// Nothing here reads a clock.
//
// Nothing here reaches a URL either. "event" is on the ad blockers' list (see
// shared/conventions.test.ts), which is why the concept is called an occasion.

import { rate, separated } from "./sample";
import type { Surface } from "./types";

/** Every occasion the code knows how to dress for. A closed set, like ROUND_KINDS. */
export const OCCASION_IDS = ["halloween"] as const;
export type OccasionId = (typeof OCCASION_IDS)[number];

export interface OccasionMeta {
  id: OccasionId;
  /** What the back office calls it. */
  name: string;
  /** What the diner calls it, in its own voice: the marquee and the share line. */
  billing: string;
  /** Default window, MM-DD, both ends inclusive. `from` after `to` wraps the new year. */
  from: string;
  to: string;
  /**
   * One line between the grid and the url in a shared result. Emoji are fine
   * here (share text keeps emoji); it never names the dish.
   */
  shareLine: string;
}

export const OCCASIONS: Record<OccasionId, OccasionMeta> = {
  halloween: {
    id: "halloween",
    name: "Halloween",
    billing: "Graveyard shift",
    from: "10-24",
    to: "10-31",
    shareLine: "🎃 Graveyard shift at Lunch Special",
  },
};

export function isOccasionId(value: unknown): value is OccasionId {
  return typeof value === "string" && (OCCASION_IDS as readonly string[]).includes(value);
}

/** A row of `occasion_bookings`, as the fold needs it. */
export interface OccasionBooking {
  occasionId: OccasionId;
  /** First day, YYYY-MM-DD, inclusive. */
  startDate: string;
  /** Last day, YYYY-MM-DD, inclusive. */
  endDate: string;
  /** Off outranks the dates: an inactive booking covers its days with nothing. */
  isActive: boolean;
}

/** A stretch of consecutive days, both ends inclusive. */
export interface Span {
  start: string;
  end: string;
}

const covers = (s: Span, day: string) => s.start <= day && day <= s.end;
const overlaps = (a: Span, b: Span) => a.start <= b.end && b.start <= a.end;

/**
 * The occasion's default window that `day` falls inside, or null.
 *
 * A wrapping window (Dec 31 → Jan 1) belongs to the year it opens in, so a
 * January day checks the window that opened the December before.
 */
export function defaultSeason(id: OccasionId, day: string): Span | null {
  const { from, to } = OCCASIONS[id];
  const year = Number(day.slice(0, 4));
  const candidates: Span[] =
    from <= to
      ? [{ start: `${year}-${from}`, end: `${year}-${to}` }]
      : [
          { start: `${year - 1}-${from}`, end: `${year}-${to}` },
          { start: `${year}-${from}`, end: `${year + 1}-${to}` },
        ];
  return candidates.find((s) => covers(s, day)) ?? null;
}

/** The default window that opens in `year`. What /admin offers to book. */
export function seasonOpening(id: OccasionId, year: number): Span {
  const { from, to } = OCCASIONS[id];
  return { start: `${year}-${from}`, end: `${from <= to ? year : year + 1}-${to}` };
}

/**
 * Which occasion, if any, the diner wears on `day`.
 *
 * Where two would overlap, the earlier one in OCCASION_IDS wins. Handcrafted
 * costumes don't layer: one set of decorations was designed for each room.
 */
export function occasionOn(day: string, bookings: readonly OccasionBooking[]): OccasionId | null {
  for (const id of OCCASION_IDS) {
    const own = bookings.filter((b) => b.occasionId === id);
    const spans = own.map((b) => ({ start: b.startDate, end: b.endDate }));
    if (own.some((b, i) => b.isActive && covers(spans[i], day))) return id;
    const season = defaultSeason(id, day);
    if (season && !spans.some((s) => overlaps(s, season))) return id;
  }
  return null;
}

/** One unbroken run of an occasion, as the dashboard draws and counts it. */
export interface OccasionRun extends Span {
  occasionId: OccasionId;
}

/**
 * Every run of consecutive costumed days between `from` and `to` (inclusive),
 * oldest first. A run is clipped to the range, so a window still in progress
 * ends at `to`.
 */
export function occasionRuns(from: string, to: string, bookings: readonly OccasionBooking[]): OccasionRun[] {
  const runs: OccasionRun[] = [];
  for (let day = from; day <= to; day = nextDay(day)) {
    const id = occasionOn(day, bookings);
    const last = runs.at(-1);
    if (id && last && last.occasionId === id && last.end === prevDay(day)) last.end = day;
    else if (id) runs.push({ occasionId: id, start: day, end: day });
  }
  return runs;
}

function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
}
const nextDay = (day: string) => shiftDay(day, 1);
const prevDay = (day: string) => shiftDay(day, -1);

/**
 * The comparison window for a run: the same number of days, ending the day
 * before it starts, moved back to whole weeks so every weekday appears as
 * often in both. A Saturday Halloween compared against a run of Tuesdays would
 * be measuring the weekend.
 */
export function baselineFor(run: Span): Span {
  const length = Math.round((Date.parse(`${run.end}T00:00:00Z`) - Date.parse(`${run.start}T00:00:00Z`)) / 86_400_000) + 1;
  const weeks = Math.ceil(length / 7);
  const start = shiftDay(run.start, -7 * weeks);
  return { start, end: shiftDay(start, length - 1) };
}

/** Checks the admin form makes before a booking is written. */
export function parseBookingInput(raw: unknown): { input: OccasionBooking } | { error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (!isOccasionId(b.occasionId)) return { error: "Unknown occasion" };
  const startDate = typeof b.startDate === "string" ? b.startDate.trim() : "";
  const endDate = typeof b.endDate === "string" ? b.endDate.trim() : "";
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE.test(startDate) || Number.isNaN(Date.parse(startDate))) return { error: "Start date must be YYYY-MM-DD" };
  if (!DATE.test(endDate) || Number.isNaN(Date.parse(endDate))) return { error: "End date must be YYYY-MM-DD" };
  if (endDate < startDate) return { error: "The end date can't be before the start date" };
  // A costume is a few days to a few weeks. Anything longer is a typo in the year.
  if (Date.parse(endDate) - Date.parse(startDate) > 62 * 86_400_000) return { error: "An occasion runs 63 days at most" };
  // Absent means on, like a notice: a booking you just made is one you meant.
  const isActive = b.isActive === undefined ? true : b.isActive === true;
  return { input: { occasionId: b.occasionId, startDate, endDate, isActive } };
}

// ---- What the back office reads ----

/** One room's rounds over a stretch of days. Counts only; the panel makes the rates. */
export interface OccasionTally {
  /** Rounds begun with a play date in the span. */
  started: number;
  completed: number;
  shared: number;
}

// ---- Reach: who saw a costume (occasion_views, migrations/0055) ----

/** Where the costume was on screen. */
export const OCCASION_ROOMS = ["diner", "bar"] as const;
export type OccasionRoom = (typeof OCCASION_ROOMS)[number];

/**
 * What a device did with it. `seen` is the costume on screen; `knock` is the
 * ghost under the cloche (three knocks). A new moment is a code change here.
 */
export const OCCASION_MOMENTS = ["seen", "knock"] as const;
export type OccasionMoment = (typeof OCCASION_MOMENTS)[number];

/** What POST /api/occasions/seen carries. */
export interface OccasionSighting {
  occasionId: OccasionId;
  playerId: string;
  /** The round's own day that put the costume on: puzzle date or night key. */
  playDay: string;
  room: OccasionRoom;
  moment: OccasionMoment;
  surface: Surface;
}

/** One deduped row of occasion_views, as the reach fold reads it. */
export interface SightingRow {
  player_id: string;
  seen_day: string;
  play_day: string;
  room: string;
  moment: string;
  surface: string;
}

/**
 * How far a run's costume reached. Every count is distinct devices; nothing
 * here is a rate, so the panel makes the rates and carries their intervals.
 */
export interface OccasionReach {
  /**
   * The first day this run was measured from, or null when sightings began
   * after it ended. Null means unmeasured, never zero (the run predates the
   * ledger).
   */
  measuredFrom: string | null;
  /** Devices that saw the costume on a day of the run. */
  devices: number;
  byRoom: Record<OccasionRoom, number>;
  bySurface: Record<Surface, number>;
  /** Every day of the run up to today, in order, zero-filled. */
  daily: { date: string; devices: number }[];
  /** Devices that saw it on two or more days of the run. */
  returned: number;
  /** Devices that knocked the ghost out from under the cloche. */
  knocked: number;
  /**
   * Devices that saw this run's costume AFTER it ended: a Leftover from one of
   * its days, replayed in costume. Attributed by play_day, counted by device.
   */
  after: number;
}

/**
 * Fold a run's sighting rows into its reach. `rows` are every row whose
 * play_day falls in the run; this decides which of them count where.
 * `trackingStart` is the first seen_day in the whole ledger.
 */
export function foldReach(run: Span, today: string, rows: readonly SightingRow[], trackingStart: string | null): OccasionReach {
  const last = run.end < today ? run.end : today;
  const measuredFrom = trackingStart === null || trackingStart > run.end ? null : trackingStart > run.start ? trackingStart : run.start;
  const during = rows.filter((r) => r.moment === "seen" && r.seen_day >= run.start && r.seen_day <= run.end);
  const distinct = (list: readonly SightingRow[]) => new Set(list.map((r) => r.player_id)).size;

  const daysPerDevice = new Map<string, Set<string>>();
  for (const r of during) {
    const days = daysPerDevice.get(r.player_id) ?? new Set<string>();
    days.add(r.seen_day);
    daysPerDevice.set(r.player_id, days);
  }

  const daily: { date: string; devices: number }[] = [];
  for (let d = run.start; d <= last; d = shiftDay(d, 1)) {
    daily.push({ date: d, devices: distinct(during.filter((r) => r.seen_day === d)) });
  }

  return {
    measuredFrom,
    devices: distinct(during),
    byRoom: {
      diner: distinct(during.filter((r) => r.room === "diner")),
      bar: distinct(during.filter((r) => r.room === "bar")),
    },
    bySurface: {
      web: distinct(during.filter((r) => r.surface === "web")),
      discord: distinct(during.filter((r) => r.surface === "discord")),
    },
    daily,
    returned: [...daysPerDevice.values()].filter((days) => days.size >= 2).length,
    knocked: distinct(rows.filter((r) => r.moment === "knock")),
    after: distinct(rows.filter((r) => r.moment === "seen" && r.seen_day > run.end)),
  };
}

export interface OccasionRunReport extends OccasionRun {
  /** Same length, same weekdays, just before the run. See {@link baselineFor}. */
  baseline: Span;
  /** The run reaches today or later: its numbers are still coming in. */
  pending: boolean;
  /**
   * A Special and a Nightcap are counted apart, never pooled: their finish and
   * share rates are different games' rates.
   */
  lunch: { run: OccasionTally; baseline: OccasionTally };
  night: { run: OccasionTally; baseline: OccasionTally };
  reach: OccasionReach;
  /** Devices whose first-ever round started on a day of the run, and of the baseline. */
  firstTimers: { run: number; baseline: number };
}

export interface OccasionReport {
  today: string;
  /** Every run from Puzzle #1 to today, newest first. Upcoming runs are not here. */
  runs: OccasionRunReport[];
  /** The first ET day any sighting was recorded, or null before the ledger has a row. */
  trackingStart: string | null;
}

/** GET /api/admin/occasions: the registry, the bookings and the day it was read. */
export interface AdminOccasions {
  today: string;
  occasions: OccasionMeta[];
  bookings: (OccasionBooking & { id: number })[];
}

/**
 * The one sentence a costumed run supports: did people share more?
 *
 * Share rate is shared / finished, pooled over the whole run and over its
 * baseline (never averaged across days), and only called a difference when the
 * two 95% intervals don't overlap (shared/sample.ts). It is the honest metric
 * for a decoration: a costume can't make the Special easier, but it can make a
 * result worth posting. A run still in progress says so instead of a verdict.
 */
export function shareVerdict(during: OccasionTally, before: OccasionTally, pending: boolean): string {
  if (pending) return "Still running. Read it once the costume comes off.";
  const a = rate(during.shared, during.completed);
  const b = rate(before.shared, before.completed);
  if (!a || !b) return "Not enough finished rounds on one side to compare.";
  if (separated(a, b)) {
    return `Shares ran ${a.pct > b.pct ? "higher" : "lower"} in costume: ${a.pct}% of finished rounds against ${b.pct}% on the same weekdays before.`;
  }
  return `No clear difference in sharing: ${a.pct}% of finished rounds in costume against ${b.pct}% before.`;
}
