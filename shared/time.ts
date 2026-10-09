// Daily-rollover clock. The Special changes at midnight in ONE fixed zone for
// every player, everywhere — not the browser's local midnight, and not UTC.
// Shared by the Worker (what "today" resolves to) and the client (which date it
// plays + the countdown). See GitHub #33.

/** The timezone the daily Special rolls over in. */
export const GAME_TIMEZONE = "America/New_York";

// en-CA renders dates as YYYY-MM-DD, matching the format used everywhere else.
const isoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAME_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The game's current calendar date (YYYY-MM-DD) in GAME_TIMEZONE. */
export function gameToday(now: Date = new Date()): string {
  return isoDate.format(now);
}

const wallClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: GAME_TIMEZONE,
  hourCycle: "h23", // 00–23, so midnight reads 00 (not the "24" some ICU builds emit)
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Milliseconds from `now` until the next midnight in GAME_TIMEZONE — i.e. when
 * today's Special is replaced. Derived from the zone's wall-clock time, so it
 * stays correct across the browser's own timezone and DST shifts.
 */
export function msUntilGameMidnight(now: Date = new Date()): number {
  const elapsed = msSinceZoneMidnight(now);
  // Assume a 24-hour day, then correct by where that guess actually lands on
  // the wall. Twice a year the day is 23 or 25 hours long, and from 00:00 to
  // 02:00 on those days the naive answer is an hour out in either direction.
  const guess = now.getTime() + 86_400_000 - elapsed;
  const landed = msSinceZoneMidnight(new Date(guess));
  const correction = landed > 43_200_000 ? 86_400_000 - landed : -landed;
  return 86_400_000 - elapsed + correction;
}

/** Milliseconds since the last midnight in GAME_TIMEZONE, read off the wall clock. */
function msSinceZoneMidnight(instant: Date): number {
  const parts = wallClock.formatToParts(instant);
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return ((at("hour") * 60 + at("minute")) * 60 + at("second")) * 1000 + instant.getMilliseconds();
}

const zoneHour = new Intl.DateTimeFormat("en-US", {
  timeZone: GAME_TIMEZONE,
  hour: "2-digit",
  hourCycle: "h23", // 00–23
});

/** Hour of day (0–23) of the given instant in GAME_TIMEZONE. */
export function gameHour(instant: Date): number {
  return Number(zoneHour.format(instant));
}

const zoneDay = new Intl.DateTimeFormat("en-US", {
  timeZone: GAME_TIMEZONE,
  month: "numeric",
  day: "numeric",
});

/** Hour (0–23) as 1–12 with its "AM" / "PM" suffix. */
function twelveHour(h: number): { h: number; suffix: "AM" | "PM" } {
  return { h: h % 12 === 0 ? 12 : h % 12, suffix: h < 12 ? "AM" : "PM" };
}

/**
 * An instant as a compact wall clock in GAME_TIMEZONE — "7/20 2:32:07 PM". Used by
 * the admin activity feed, which logs UTC instants but reads them in game time.
 */
export function gameTimestamp(instant: Date): string {
  const [hh, mm, ss] = wallClock.format(instant).split(":").map(Number);
  const t = twelveHour(hh);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${zoneDay.format(instant)} ${t.h}:${pad(mm)}:${pad(ss)} ${t.suffix}`;
}

/**
 * An instant as an hours:minutes wall clock in GAME_TIMEZONE — "5:58 PM". The
 * activity feed's visit headers use it for a span ("5:58 PM → 11:41 PM"), where
 * {@link gameTimestamp}'s date and seconds would be noise on both ends.
 */
export function gameClock(instant: Date): string {
  const [hh, mm] = wallClock.format(instant).split(":").map(Number);
  const t = twelveHour(hh);
  return `${t.h}:${String(mm).padStart(2, "0")} ${t.suffix}`;
}

/** An hour of day (0–23) as "2 PM", the dashboard's one way to name an hour. */
export function hourOfDay(h: number): string {
  const t = twelveHour(h);
  return `${t.h} ${t.suffix}`;
}

/** An hour of day as an axis tick, short enough for a narrow column: "12a", "3p". */
export function hourTick(h: number): string {
  const t = twelveHour(h);
  return `${t.h}${t.suffix === "AM" ? "a" : "p"}`;
}

/** Break a millisecond span into zero-padded hh/mm/ss strings for a countdown. */
export function hms(ms: number): { h: string; m: string; s: string } {
  const clamped = Math.max(0, ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    h: pad(Math.floor(clamped / 3_600_000)),
    m: pad(Math.floor((clamped % 3_600_000) / 60_000)),
    s: pad(Math.floor((clamped % 60_000) / 1000)),
  };
}

/** Whole days from ET day `a` to ET day `b`. Both are plain calendar days, so no zone is involved. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Add `days` to a YYYY-MM-DD calendar day, returning YYYY-MM-DD. The inverse of
 * {@link daysBetween}, and a plain calendar day like it — UTC noon-free because
 * both ends are parsed at UTC midnight, so no zone or DST shift can move it.
 */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
