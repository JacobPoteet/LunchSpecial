// What players guess, folded from analytics_guesses (migrations/0053).
//
// Written once for both catalogues: the dish ledger and the drink ledger differ
// only in which column pair the route reads, so the rows arrive as target_id /
// guessed_id and the fold never learns which menu it is looking at.
//
// The report folds are counts only: the grouping key is (answer, pick), and
// nothing in them can name a player. `foldRoundGuesses` at the bottom is the one
// exception, and it is keyed by a single round id: the admin's Activity feed
// opens one round and reads what it guessed, in order. A guess is a pick from the
// catalogue, so a row carries nothing personal, and that route sits behind the
// admin session like the rest of /api/admin.

import type { GuessPick, GuessReport, GuessReportRow, RoundGuess, RoundGuesses } from "../shared/types";

/** One (answer, pick) pair, with whether it was guess number one. */
export interface GuessPairRow {
  target_id: number;
  guessed_id: number;
  opener: number;
  n: number;
}

export interface GuessRoundsRow {
  target_id: number;
  rounds: number;
}

export interface GuessNameRow {
  id: number;
  name: string;
  country: string;
}

export interface GuessTotalsRow {
  guesses: number;
  rounds: number;
  /** UTC stamp of the first recorded guess, or null before any. */
  first: string | null;
}

/** How many wrong picks an answer lists, and how long the two overall lists run. */
export const TOP_WRONG = 3;
export const TOP_OVERALL = 8;

const byCount = (a: GuessPick, b: GuessPick) => b.count - a.count || a.name.localeCompare(b.name);

export function foldGuessStats(
  pairs: Iterable<GuessPairRow>,
  rounds: Iterable<GuessRoundsRow>,
  items: Iterable<GuessNameRow>,
  totals: GuessTotalsRow | undefined,
): GuessReport {
  const names = new Map<number, GuessNameRow>();
  for (const d of items) names.set(d.id, d);
  const roundsOf = new Map<number, number>();
  for (const r of rounds) roundsOf.set(r.target_id, r.rounds);

  const perTarget = new Map<number, { guesses: number; wrong: Map<number, number> }>();
  const decoys = new Map<number, number>();
  const openers = new Map<number, number>();

  for (const p of pairs) {
    // An item deleted since has no name to show; its guesses can't be listed.
    if (!names.has(p.target_id) || !names.has(p.guessed_id)) continue;
    const t = perTarget.get(p.target_id) ?? { guesses: 0, wrong: new Map<number, number>() };
    t.guesses += p.n;
    if (p.guessed_id !== p.target_id) {
      t.wrong.set(p.guessed_id, (t.wrong.get(p.guessed_id) ?? 0) + p.n);
      decoys.set(p.guessed_id, (decoys.get(p.guessed_id) ?? 0) + p.n);
    }
    if (p.opener) openers.set(p.guessed_id, (openers.get(p.guessed_id) ?? 0) + p.n);
    perTarget.set(p.target_id, t);
  }

  const pick = (id: number, count: number): GuessPick => ({ id, name: names.get(id)!.name, count });
  const top = (m: Map<number, number>, n: number) =>
    [...m].map(([id, count]) => pick(id, count)).sort(byCount).slice(0, n);

  const rows: GuessReportRow[] = [];
  for (const [id, t] of perTarget) {
    if (t.wrong.size === 0) continue;
    const d = names.get(id)!;
    rows.push({
      id: id,
      name: d.name,
      country: d.country,
      guesses: t.guesses,
      rounds: roundsOf.get(id) ?? 0,
      topWrong: top(t.wrong, TOP_WRONG),
    });
  }
  rows.sort((a, b) => b.guesses - a.guesses || a.name.localeCompare(b.name));

  return {
    guesses: totals?.guesses ?? 0,
    rounds: totals?.rounds ?? 0,
    since: totals?.first ? totals.first.slice(0, 10) : null,
    rows,
    decoys: top(decoys, TOP_OVERALL),
    openers: top(openers, TOP_OVERALL),
  };
}

/** One ledger row for a round, with the guessed item's name already joined. */
export interface RoundGuessRow {
  guess_number: number;
  name: string | null;
  country: string | null;
  /** 1 when the pick was the answer. Computed in SQL from the two id columns. */
  correct: number;
  /** SQLite datetime ("2026-10-08 20:01:00"), UTC. */
  created_at: string;
}

/**
 * One round's guesses, in the order they were made. The query orders them, and
 * this orders them again: the primary key is (round, number), so a fold that
 * trusted its input would be one reordered query away from a scrambled board.
 */
export function foldRoundGuesses(roundId: string, rows: Iterable<RoundGuessRow>): RoundGuesses {
  const guesses: RoundGuess[] = [...rows]
    .map((r) => ({
      number: r.guess_number,
      name: r.name,
      country: r.country,
      correct: r.correct === 1,
      at: `${r.created_at.replace(" ", "T")}Z`,
    }))
    .sort((a, b) => a.number - b.number);
  return { roundId, guesses };
}
