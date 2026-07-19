// Client-side helpers for the puzzle archive (playing previous days).
// Puzzle dates run from EPOCH_DATE (puzzle #1) up to today (midnight-ET rollover).

import { EPOCH_DATE } from "../../shared/types";

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Puzzle number for a date (1 on the epoch), mirroring the server's math. */
export function puzzleNumberFor(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${EPOCH_DATE}T00:00:00Z`);
  return Math.round(ms / DAY_MS) + 1;
}

/** A real puzzle date: from the epoch up to and including `today`. */
export function isPuzzleDate(date: string, today: string): boolean {
  return DATE_RE.test(date) && date >= EPOCH_DATE && date <= today;
}

/** An earlier puzzle than today's — the archive-playable range. */
export function isPastPuzzleDate(date: string, today: string): boolean {
  return isPuzzleDate(date, today) && date < today;
}

/** Add `days` to a YYYY-MM-DD date, returning YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Every puzzle date from the epoch to `today`, inclusive, oldest first. */
export function puzzleDates(today: string): string[] {
  const dates: string[] = [];
  for (let d = EPOCH_DATE; d <= today; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** Long-form label for a date, e.g. "Saturday, July 18". Noon avoids tz drift. */
export function dateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
