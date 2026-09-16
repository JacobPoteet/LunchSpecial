// The daily tally: how the room did on one Special — PURE.
//
// "68% of diners got it · most in 3" on the check, from the day's completed
// daily rounds. Two rules from the dashboard apply to players too, and this
// module is where they are enforced rather than in the component:
//
// 1. A rate off a thin denominator is not quoted. Under SMALL_SAMPLE_MIN
//    finishes the line is null and the check prints nothing, not a hedge.
// 2. Only completed rounds count. A board still open is not a miss.

import { SMALL_SAMPLE_MIN } from "./sample";
import type { DailyTally } from "./types";

/** One completed round, as the route reads it off analytics_rounds. */
export interface TallyRow {
  guesses: number;
  solved: number;
}

/**
 * Fold the day's completed rounds into a tally. `distribution[i]` is the
 * number of rounds solved in i+1 guesses, always `maxGuesses` wide; a solved
 * round with a guess count outside 1..maxGuesses (a corrupt beacon) is
 * counted as solved but placed nowhere.
 */
export function foldTally(rows: TallyRow[], maxGuesses: number): DailyTally {
  const distribution = Array.from({ length: maxGuesses }, () => 0);
  let solved = 0;
  for (const r of rows) {
    if (r.solved !== 1) continue;
    solved += 1;
    if (r.guesses >= 1 && r.guesses <= maxGuesses) distribution[r.guesses - 1] += 1;
  }
  return { finished: rows.length, solved, distribution };
}

/** Which guess count most solves landed on; null when nobody solved it. */
export function modalGuess(tally: DailyTally): number | null {
  let best = -1;
  let at: number | null = null;
  tally.distribution.forEach((n, i) => {
    // Strictly greater keeps the earliest count on a tie, so "most in 2"
    // rather than "most in 4" when the two are level.
    if (n > best) {
      best = n;
      at = i + 1;
    }
  });
  return best > 0 ? at : null;
}

/**
 * The line under the stats on the check, or null when there isn't enough to
 * say. The percentage is of *finished* rounds, so a room that mostly gave up
 * reads as a hard Special rather than a popular one.
 */
export function tallyLine(tally: DailyTally): string | null {
  if (tally.finished < SMALL_SAMPLE_MIN) return null;
  const pct = Math.round((tally.solved / tally.finished) * 100);
  const mode = modalGuess(tally);
  const room = `${pct}% of diners got today's Special`;
  return mode === null ? `${room}.` : `${room} · most in ${mode}`;
}
