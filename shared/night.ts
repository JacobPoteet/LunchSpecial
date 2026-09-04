// The After Dark clock — PURE.
//
// Everything else in this game rolls over at midnight America/New_York, for
// every player, on purpose (shared/time.ts). After Dark deliberately breaks
// that: the bar opens at 20:00 and closes at 03:00 on the *player's own* wall
// clock, so a night in Sydney and a night in Chicago are different instants.
//
// That break is contained here. Nothing outside this module decides when the
// bar is open or which night a round belongs to, and every function takes the
// clock as an argument rather than reading one — the same rule shared/build.ts
// follows about __BUILD__, and what makes all of this testable without setting
// a process timezone.

import { addDays, daysBetween } from "./time";
import { NIGHT_EPOCH_DATE } from "./types";

/** Local hour the bar opens (inclusive). */
export const BAR_OPEN_HOUR = 20;
/** Local hour the bar stops admitting anyone (exclusive) — last call. */
export const BAR_CLOSE_HOUR = 3;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const OPEN_MS = BAR_OPEN_HOUR * HOUR_MS;
const CLOSE_MS = BAR_CLOSE_HOUR * HOUR_MS;

/**
 * A local wall clock, broken into parts. Deliberately not a `Date`: a Date
 * carries a timezone that every function here would then have to agree about,
 * and the whole point is that the zone in question is the player's, which the
 * client already knows and the Worker never can.
 */
export interface LocalClock {
  year: number;
  month: number; // 1-12, like the ISO string it turns into
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  ms: number;
}

/**
 * Read a Date in whatever zone the runtime is sitting in. The one function here
 * that touches an ambient clock, kept to two lines so the folds below stay pure.
 */
export function localClock(now: Date = new Date()): LocalClock {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
    ms: now.getMilliseconds(),
  };
}

/** Milliseconds elapsed since local midnight. */
function sinceMidnight(c: LocalClock): number {
  return ((c.hour * 60 + c.minute) * 60 + c.second) * 1000 + c.ms;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The clock's own calendar day as YYYY-MM-DD. */
function calendarDay(c: LocalClock): string {
  return `${c.year}-${pad(c.month)}-${pad(c.day)}`;
}

/**
 * Which night this instant belongs to: the local calendar day the *evening*
 * began on.
 *
 * The hours 00:00–02:59 belong to the night before, which is the whole reason
 * this isn't just a date string. A round begun at 23:50 and finished at 00:10 is
 * one sitting on one drink, and a player who watched the date tick over
 * mid-round should not be handed a second Nightcap.
 *
 * Outside the window (03:00–19:59) it names the night that is *coming*, which is
 * what the countdown on the closed sign counts down to.
 */
export function nightKey(c: LocalClock): string {
  const today = calendarDay(c);
  return sinceMidnight(c) < CLOSE_MS ? addDays(today, -1) : today;
}

/** Is the bar admitting anyone right now? */
export function barIsOpen(c: LocalClock): boolean {
  const ms = sinceMidnight(c);
  return ms >= OPEN_MS || ms < CLOSE_MS;
}

/**
 * Milliseconds until the doors open, or 0 if they already are.
 *
 * Only ever called on the closed branch, where `sinceMidnight` is between
 * CLOSE_MS and OPEN_MS by definition, so this never has to wrap a day.
 */
export function msUntilOpen(c: LocalClock): number {
  if (barIsOpen(c)) return 0;
  return OPEN_MS - sinceMidnight(c);
}

/**
 * Milliseconds until last call, or 0 if the bar is already shut.
 *
 * Last call is a *door*, not a timer: this drives the countdown on the board and
 * decides whether the entrance is offered. A round already in progress when it
 * reaches zero runs to completion — killing a live board on a clock tick is the
 * most annoying thing this mode could do, so nothing here is wired to do it.
 */
export function msUntilLastCall(c: LocalClock): number {
  if (!barIsOpen(c)) return 0;
  const ms = sinceMidnight(c);
  return ms >= OPEN_MS ? DAY_MS - ms + CLOSE_MS : CLOSE_MS - ms;
}

/**
 * Night #1 is {@link NIGHT_EPOCH_DATE}. Mirrors puzzleNumber() in worker/game.ts,
 * against its own epoch — the bar opened long after the diner did, and numbering
 * the first Nightcap #54 because that is the lunch count would be a lie about
 * how many nights there have been.
 */
export function nightNumber(night: string): number {
  return daysBetween(NIGHT_EPOCH_DATE, night) + 1;
}

/**
 * Will the Worker serve this night?
 *
 * The Worker cannot know a player's local time and does not try. It checks only
 * that the claimed night is within a day of ET's, which covers every real UTC
 * offset (-11 through +14, at most ~19 hours from ET either way) and nothing
 * further. The posture — and the worst case, a device with its clock wound
 * forward getting tomorrow's drink early — is the one isAllowedRequestDate()
 * already takes for the daily with its +/- 2 days.
 *
 * `etToday` is the caller's `serverToday()`. Passed in rather than read so this
 * stays a fold, and so the client can ask the same question for a disabled
 * button without a round trip.
 */
export function isPlayableNight(night: string, etToday: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return false;
  if (night < NIGHT_EPOCH_DATE) return false;
  return Math.abs(daysBetween(night, etToday)) <= 1;
}
