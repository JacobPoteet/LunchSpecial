// What players guess, folded from analytics_guesses (migrations/0053).
//
// Counts only. A guess is a pick from the catalogue, so a row carries nothing
// personal, but this still never returns a per-device trail: the grouping key is
// (answer, pick), and nothing here can name a player.

import type { GuessPick, GuessReport, GuessReportRow } from "../shared/types";

/** One (answer, pick) pair, with whether it was guess number one. */
export interface GuessPairRow {
  target_dish_id: number;
  guessed_dish_id: number;
  opener: number;
  n: number;
}

export interface GuessRoundsRow {
  target_dish_id: number;
  rounds: number;
}

export interface GuessDishRow {
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

/** How many wrong dishes a Special lists, and how long the two overall lists run. */
export const TOP_WRONG = 3;
export const TOP_OVERALL = 8;

const byCount = (a: GuessPick, b: GuessPick) => b.count - a.count || a.name.localeCompare(b.name);

export function foldGuessStats(
  pairs: Iterable<GuessPairRow>,
  rounds: Iterable<GuessRoundsRow>,
  dishes: Iterable<GuessDishRow>,
  totals: GuessTotalsRow | undefined,
): GuessReport {
  const dish = new Map<number, GuessDishRow>();
  for (const d of dishes) dish.set(d.id, d);
  const roundsOf = new Map<number, number>();
  for (const r of rounds) roundsOf.set(r.target_dish_id, r.rounds);

  const perTarget = new Map<number, { guesses: number; wrong: Map<number, number> }>();
  const decoys = new Map<number, number>();
  const openers = new Map<number, number>();

  for (const p of pairs) {
    // A dish deleted since has no name to show; its guesses can't be listed.
    if (!dish.has(p.target_dish_id) || !dish.has(p.guessed_dish_id)) continue;
    const t = perTarget.get(p.target_dish_id) ?? { guesses: 0, wrong: new Map<number, number>() };
    t.guesses += p.n;
    if (p.guessed_dish_id !== p.target_dish_id) {
      t.wrong.set(p.guessed_dish_id, (t.wrong.get(p.guessed_dish_id) ?? 0) + p.n);
      decoys.set(p.guessed_dish_id, (decoys.get(p.guessed_dish_id) ?? 0) + p.n);
    }
    if (p.opener) openers.set(p.guessed_dish_id, (openers.get(p.guessed_dish_id) ?? 0) + p.n);
    perTarget.set(p.target_dish_id, t);
  }

  const pick = (id: number, count: number): GuessPick => ({ dishId: id, name: dish.get(id)!.name, count });
  const top = (m: Map<number, number>, n: number) =>
    [...m].map(([id, count]) => pick(id, count)).sort(byCount).slice(0, n);

  const rows: GuessReportRow[] = [];
  for (const [id, t] of perTarget) {
    if (t.wrong.size === 0) continue;
    const d = dish.get(id)!;
    rows.push({
      dishId: id,
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
