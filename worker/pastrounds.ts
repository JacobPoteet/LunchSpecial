// A device's past daily rounds, folded for the Leftovers calendar -- PURE.
//
// Before #215 a finished Special never reached the device's archive, so the
// calendar showed every earlier day blank. The rounds still exist as
// analytics_rounds rows keyed by player_id, and this fold turns them into one
// outcome per day for POST /api/rounds/past. See #216.

import { EPOCH_DATE, MAX_GUESSES, type PastRound } from "../shared/types";

export interface PastRoundRow {
  play_date: string;
  solved: number | null;
  guesses: number | null;
}

/**
 * One round per date, from EPOCH_DATE up to the day before `today`.
 *
 * A device can hold several rows for one date (two tabs each minted a round
 * id). The calendar needs one answer, and the best one is the round the
 * player would call theirs: a solve beats a miss, then fewer guesses win.
 * Rows with an impossible guess count are dropped rather than clamped.
 * Today is left out because the device already has today's round.
 */
export function foldPastRounds(rows: PastRoundRow[], today: string): PastRound[] {
  const best = new Map<string, PastRound>();
  for (const row of rows) {
    if (row.play_date < EPOCH_DATE || row.play_date >= today) continue;
    const guesses = Number(row.guesses);
    if (!Number.isInteger(guesses) || guesses < 1 || guesses > MAX_GUESSES) continue;
    const round: PastRound = { date: row.play_date, solved: row.solved === 1, guesses };
    const held = best.get(round.date);
    if (!held || beats(round, held)) best.set(round.date, round);
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function beats(a: PastRound, b: PastRound): boolean {
  if (a.solved !== b.solved) return a.solved;
  return a.guesses < b.guesses;
}
