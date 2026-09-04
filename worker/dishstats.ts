// Pure per-dish performance fold for the admin Menu tab: how each dish actually
// played, as opposed to how often the kitchen served it. DB-free so it stays
// unit-testable; the route in routes/admin.ts feeds it grouped rows.
//
// `analytics_rounds.dish_id` has been stamped on every round since
// migrations/0012 and until now nothing aggregated it — the feed used it to name
// a row and that was all. So the dashboard could tell you the menu was
// Europe-heavy, and separately that Tuesday's win rate dipped, and never that
// they were the same fact. This is the join.

import { MAX_GUESSES, type DishReport, type DishReportRow, type RoundKind, type StartedByKind } from "../shared/types";

/**
 * One grouped row of rounds sharing a dish, mode and outcome. Grouping this
 * coarsely in SQL keeps the result set to a few hundred rows at any plausible
 * volume while still carrying everything the fold needs.
 */
export interface DishStatRow {
  dish_id: number | null;
  kind: RoundKind;
  completed: number;
  solved: number | null;
  shared: number;
  /** Guesses used, or null on a round that never finished. */
  guesses: number | null;
  n: number;
}

/** Catalogue detail for the dishes those rounds landed on. */
export interface DishMetaRow {
  id: number;
  name: string;
  country: string;
  region: string;
  course: string;
  protein: string;
  /** Times it has been the scheduled Special through today. */
  times_served: number;
  last_served: string | null;
}

const zeroByKind = (): StartedByKind => ({ daily: 0, leftover: 0, random: 0, nightcap: 0 });

/**
 * Fold grouped rounds into one row per dish, hardest first.
 *
 * Three decisions worth keeping:
 *
 * - **Every kind counts.** A leftover or a Chef's Choice is a real first attempt
 *   at that dish for that device — the archive shows a finished day's result
 *   rather than replaying it — and at this game's volume including them is the
 *   difference between 30 attempts and 9. `byKind` travels with each row so a
 *   dish whose record is mostly replays can be seen for what it is.
 * - **Ordered by how hard it played, not by how popular it was.** The question
 *   this table answers is which puzzles are landing; a popularity sort just
 *   reproduces the schedule. Dishes nobody completed sort last rather than
 *   first — an unmeasured dish isn't a hard one.
 * - **Rounds with no dish are counted, not distributed.** Pre-0012 rows carry
 *   NULL; folding them into any dish would invent attempts, and dropping them
 *   silently would leave the totals not adding up.
 */
export function foldDishStats(rows: Iterable<DishStatRow>, meta: Iterable<DishMetaRow>): DishReport {
  const byId = new Map<number, DishReportRow>();
  for (const m of meta) {
    byId.set(m.id, {
      dishId: m.id,
      name: m.name,
      country: m.country,
      region: m.region as DishReportRow["region"],
      course: m.course as DishReportRow["course"],
      protein: m.protein as DishReportRow["protein"],
      started: 0,
      completed: 0,
      solved: 0,
      fails: 0,
      shared: 0,
      byKind: zeroByKind(),
      guessDistribution: Array.from({ length: MAX_GUESSES }, () => 0),
      timesServed: m.times_served,
      lastServed: m.last_served,
    });
  }

  let untracked = 0;
  let rounds = 0;
  for (const r of rows) {
    if (r.dish_id === null) {
      untracked += r.n;
      continue;
    }
    const dish = byId.get(r.dish_id);
    // A dish deleted from the catalogue can still have rounds pointing at it.
    // There's no name to show, so it joins the untracked count rather than
    // becoming a nameless row.
    if (!dish) {
      untracked += r.n;
      continue;
    }
    rounds += r.n;
    dish.started += r.n;
    if (r.kind in dish.byKind) dish.byKind[r.kind] += r.n;
    dish.shared += r.shared ? r.n : 0;
    if (r.completed) {
      dish.completed += r.n;
      if (r.solved) {
        dish.solved += r.n;
        if (r.guesses !== null && r.guesses >= 1 && r.guesses <= MAX_GUESSES) {
          dish.guessDistribution[r.guesses - 1] += r.n;
        }
      } else {
        dish.fails += r.n;
      }
    }
  }

  const played = [...byId.values()].filter((d) => d.started > 0);
  played.sort((a, b) => {
    // Hardest first, by the rate that survives a thin sample best: share of
    // completions that were losses. Dishes nobody has completed have no
    // difficulty to report and fall to the bottom, ordered by attempts so the
    // busiest unmeasured one is the one you'd look at next.
    const aRate = a.completed === 0 ? -1 : a.fails / a.completed;
    const bRate = b.completed === 0 ? -1 : b.fails / b.completed;
    if (aRate !== bRate) return bRate - aRate;
    if (a.completed !== b.completed) return b.completed - a.completed;
    return b.started - a.started;
  });

  return { rows: played, untracked, rounds };
}
