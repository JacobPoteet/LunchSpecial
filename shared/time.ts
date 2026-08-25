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
  const parts = wallClock.formatToParts(now);
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const elapsed = ((at("hour") * 60 + at("minute")) * 60 + at("second")) * 1000 + now.getMilliseconds();
  return 86_400_000 - elapsed;
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

/**
 * An instant as a compact wall clock in GAME_TIMEZONE — "7/20 14:32:07". Used by
 * the admin activity feed, which logs UTC instants but reads them in game time.
 */
export function gameTimestamp(instant: Date): string {
  return `${zoneDay.format(instant)} ${wallClock.format(instant)}`;
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
