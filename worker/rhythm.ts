// Pure weekday × hour fold for the admin Trends tab: when in the week, and when
// in the day, people actually play. DB-free so it stays unit-testable; the route
// in routes/admin.ts feeds it the *same* all-time hour buckets the growth curve
// already reads, so the whole thing costs no extra query.
//
// Same timezone problem as worker/players.ts, service.ts and growth.ts:
// started_at is stored in UTC and SQLite has no named-timezone support, so rows
// arrive as UTC hour buckets ("YYYY-MM-DD HH") and are folded into ET days and
// hours here — the same midnight-ET boundary the game rolls over on.
//
// This replaces the flat 24-hour bar chart that used to live on Trends. That
// chart and the 30-day spark beside it were two one-dimensional shadows of the
// same two-dimensional thing, and the interaction between them — Sunday mornings
// are busy, Tuesday mornings are dead — was invisible in both. For a game that
// resets every midnight, the weekly cycle is the dominant seasonality, and the
// growth chart's own reasoning ("a per-day series is dominated by which day of
// the week you're looking at") is an argument for measuring it, not for looking
// away.

import { gameHour, gameToday } from "../shared/time";
import type { PlayRhythm, WeekdayPlay } from "../shared/types";

const HOURS = 24;
const DAYS_IN_WEEK = 7;

/** One all-time UTC hour bucket: how many rounds started in it. */
export interface RhythmRow {
  /** UTC hour bucket from strftime('%Y-%m-%d %H', started_at). */
  bucket: string;
  n: number;
}

/**
 * Weekday (0 = Sunday) of an ET calendar date.
 *
 * The date string is already in ET, so it's read as a plain calendar date at UTC
 * midnight — which day of the week it names doesn't depend on any zone, and
 * parsing it as local time would shift it by one west of Greenwich.
 */
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** "2026-07-24" → "2026-07-25". Plain calendar arithmetic on an ET day. */
function nextDate(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Fold all-time UTC hour buckets into the weekly rhythm: a 7 × 24 grid, its two
 * marginals, and the span they were measured over.
 *
 * The one thing that can't be done in SQL and is easy to get wrong: **weekday
 * figures are averages per occurrence, not totals.** A run that starts on a
 * Friday has had one more Friday than Thursday in it, and at three weeks of
 * history that's a 33% head start — enough to invent a "Friday is our big day"
 * that is purely an artifact of the launch date. So every weekday carries how
 * many times it has come around (`days`, counted across the whole calendar span
 * including dead days, because a Monday nobody played is a real zero once the
 * game is live) and the per-occurrence mean is what gets charted.
 *
 * The grid itself stays as raw counts — it's read as a texture, and 24 × 7 cells
 * of averages-to-one-decimal is a table pretending to be a heatmap.
 */
export function foldRhythm(rows: Iterable<RhythmRow>, today: string): PlayRhythm {
  const heat: number[][] = Array.from({ length: DAYS_IN_WEEK }, () => Array.from({ length: HOURS }, () => 0));
  const byHour = Array.from({ length: HOURS }, () => 0);
  const startedByWeekday = Array.from({ length: DAYS_IN_WEEK }, () => 0);
  let first: string | null = null;
  let total = 0;

  for (const r of rows) {
    // Rebuilt at mid-hour to stay clear of boundary rounding, as everywhere else.
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    const et = gameToday(instant);
    // started_at is server-written, so a day after today can't be real.
    if (et > today) continue;
    const hour = gameHour(instant);
    const weekday = weekdayOf(et);
    heat[weekday][hour] += r.n;
    byHour[hour] += r.n;
    startedByWeekday[weekday] += r.n;
    total += r.n;
    if (first === null || et < first) first = et;
  }

  // How many times each weekday has come around since the first recorded round.
  // Counted over the calendar, not over active days: once the beacon is live, a
  // Monday with no rounds is a measured zero and belongs in the denominator.
  const occurrences = Array.from({ length: DAYS_IN_WEEK }, () => 0);
  let span = 0;
  if (first !== null) {
    for (let d = first; d <= today; d = nextDate(d)) {
      occurrences[weekdayOf(d)] += 1;
      span += 1;
    }
  }

  const byWeekday: WeekdayPlay[] = Array.from({ length: DAYS_IN_WEEK }, (_, weekday) => ({
    weekday,
    started: startedByWeekday[weekday],
    days: occurrences[weekday],
    perDay: occurrences[weekday] === 0 ? 0 : startedByWeekday[weekday] / occurrences[weekday],
  }));

  return { heat, byHour, byWeekday, days: span, started: total, since: first };
}
