// Variety-aware autofill — PURE.
//
// The autofill used to sort the schedulable pool by least-recently-served and
// book it in that order, so rest was the only criterion and three European
// entrées in a row was a normal week. Rest still comes first here, but in
// tiers rather than to the day: once a dish is well rested, what it sits next
// to on the board decides, and the exact rest only breaks ties.
//
// Nothing here blocks a hand booking. The board prints a balance line
// (shared/schedule.ts boardBalance) and books what it is told; this fold only
// speaks when the kitchen asks it to fill the empty days.

import type { Course, Region } from "../shared/types";
import { addDays, daysBetween } from "../shared/time";

export interface VarietyCandidate {
  id: number;
  region: Region;
  course: Course;
  country: string;
  /** Most recent serving before the day being filled, or null if never. */
  lastServed: string | null;
}

/** A day already on the board, before or after the one being filled. */
export interface Booking {
  date: string;
  region: Region;
  course: Course;
  country: string;
}

/** Rest under this many days is the repeat window the route already skips. */
export const WELL_RESTED_DAYS = 180;
/** A country back inside this many days is the one repeat players notice. */
export const COUNTRY_WINDOW_DAYS = 14;
/** Days looked back for a course that has not come up in a while. Ten rather
 * than a week: at six, some course was always missing and the fill cycled all
 * five in turn, which put a drink on the lunch board every seventh day. */
export const COURSE_WINDOW_DAYS = 10;

/**
 * 2 = never served or rested past WELL_RESTED_DAYS, 1 = rested less than that.
 * Anything inside the repeat window never reaches this fold.
 */
export function restTier(candidate: VarietyCandidate, day: string): number {
  if (!candidate.lastServed) return 2;
  return daysBetween(candidate.lastServed, day) >= WELL_RESTED_DAYS ? 2 : 1;
}

/**
 * How badly a candidate clashes with what's around `day`. Zero is a perfectly
 * varied pick; a negative score is a course the board has been missing.
 *
 * | clash | cost |
 * |---|---|
 * | same region as yesterday | 3 |
 * | same region as the day before | 1 |
 * | same country inside COUNTRY_WINDOW_DAYS, either side | 4 |
 * | same course as yesterday, unless it's an entrée | 2 |
 * | a course absent from the previous COURSE_WINDOW_DAYS | −1 |
 *
 * Entrées are exempt from the course rule because they are most of the pool
 * and most of any honest week; the rule exists so two desserts don't land
 * back to back, not to ration the main course.
 */
export function varietyPenalty(candidate: VarietyCandidate, bookings: Booking[], day: string): number {
  const byDate = new Map(bookings.map((b) => [b.date, b]));
  const yesterday = byDate.get(addDays(day, -1));
  const dayBefore = byDate.get(addDays(day, -2));
  let penalty = 0;
  if (yesterday?.region === candidate.region) penalty += 3;
  if (dayBefore?.region === candidate.region) penalty += 1;
  if (yesterday?.course === candidate.course && candidate.course !== "entree") penalty += 2;
  const countryNear = bookings.some(
    (b) => b.country === candidate.country && Math.abs(daysBetween(b.date, day)) <= COUNTRY_WINDOW_DAYS,
  );
  if (countryNear) penalty += 4;
  const courseSeen = bookings.some((b) => {
    const back = daysBetween(b.date, day);
    return back >= 1 && back <= COURSE_WINDOW_DAYS && b.course === candidate.course;
  });
  if (!courseSeen) penalty -= 1;
  return penalty;
}

/**
 * The dish to book on `day`, or null if there is nothing to book. Rest tier,
 * then variety, then exact rest (never-served first, then oldest), then id so
 * two runs over the same board book the same dish.
 */
export function pickVaried(candidates: VarietyCandidate[], bookings: Booking[], day: string): VarietyCandidate | null {
  let best: { c: VarietyCandidate; tier: number; penalty: number } | null = null;
  for (const c of candidates) {
    const tier = restTier(c, day);
    const penalty = varietyPenalty(c, bookings, day);
    if (!best) {
      best = { c, tier, penalty };
      continue;
    }
    if (tier !== best.tier) {
      if (tier > best.tier) best = { c, tier, penalty };
      continue;
    }
    if (penalty !== best.penalty) {
      if (penalty < best.penalty) best = { c, tier, penalty };
      continue;
    }
    const rest = (c.lastServed ?? "").localeCompare(best.c.lastServed ?? "");
    if (rest < 0 || (rest === 0 && c.id < best.c.id)) best = { c, tier, penalty };
  }
  return best?.c ?? null;
}

/** A booking the fill made: the day, the dish, and what the fold saw in it. */
export interface Filled extends Booking {
  id: number;
}

/**
 * Fill every day in `days` (ascending) from `pool`, feeding each booking back
 * so the next day sees it. A dish is booked at most once per run. Returns the
 * bookings made, in order.
 */
export function fillVaried(pool: VarietyCandidate[], bookings: Booking[], days: string[]): Filled[] {
  const board = [...bookings];
  const left = new Map(pool.map((c) => [c.id, c]));
  const made: Filled[] = [];
  for (const day of days) {
    const pick = pickVaried([...left.values()], board, day);
    if (!pick) break;
    left.delete(pick.id);
    const booking: Filled = { id: pick.id, date: day, region: pick.region, course: pick.course, country: pick.country };
    board.push(booking);
    made.push(booking);
  }
  return made;
}
