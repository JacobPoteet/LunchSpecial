import { describe, expect, it } from "vitest";
import { foldDishStats, type DishMetaRow, type DishStatRow } from "./dishstats";
import type { RoundKind } from "../shared/types";

const meta = (id: number, name: string, extra: Partial<DishMetaRow> = {}): DishMetaRow => ({
  id,
  name,
  country: "Italy",
  region: "europe",
  course: "entree",
  protein: "vegetarian",
  times_served: 1,
  last_served: "2026-07-20",
  ...extra,
});

const round = (
  dish_id: number | null,
  opts: Partial<DishStatRow> & { n?: number } = {},
): DishStatRow => ({
  dish_id,
  kind: "daily" as RoundKind,
  completed: 1,
  solved: 1,
  shared: 0,
  guesses: 3,
  n: 1,
  ...opts,
});

describe("foldDishStats", () => {
  it("returns nothing when no rounds have been played", () => {
    const r = foldDishStats([], [meta(1, "Pizza")]);
    expect(r.rows).toEqual([]);
    expect(r.rounds).toBe(0);
    expect(r.untracked).toBe(0);
  });

  it("omits dishes in the catalogue that nobody has played", () => {
    const r = foldDishStats([round(1)], [meta(1, "Pizza"), meta(2, "Ramen")]);
    expect(r.rows.map((d) => d.name)).toEqual(["Pizza"]);
  });

  it("splits completions into wins, losses and a guess distribution", () => {
    const r = foldDishStats(
      [
        round(1, { guesses: 2, n: 3 }),
        round(1, { guesses: 5, n: 1 }),
        round(1, { solved: 0, guesses: 6, n: 2 }),
        round(1, { completed: 0, solved: null, guesses: null, n: 4 }),
      ],
      [meta(1, "Pizza")],
    );
    const d = r.rows[0];
    expect(d.started).toBe(10);
    expect(d.completed).toBe(6);
    expect(d.solved).toBe(4);
    expect(d.fails).toBe(2);
    expect(d.guessDistribution).toEqual([0, 3, 0, 0, 1, 0]);
    // A lost round's guess count is not a solve and must not enter the histogram.
    expect(d.guessDistribution.reduce((a, b) => a + b, 0)).toBe(d.solved);
  });

  it("counts every mode but keeps the split visible", () => {
    const r = foldDishStats(
      [round(1, { kind: "daily", n: 2 }), round(1, { kind: "leftover", n: 5 }), round(1, { kind: "random", n: 1 })],
      [meta(1, "Pizza")],
    );
    const d = r.rows[0];
    expect(d.started).toBe(8);
    expect(d.byKind).toEqual({ daily: 2, leftover: 5, random: 1 });
  });

  it("counts shares against the rounds that carried them", () => {
    const r = foldDishStats([round(1, { shared: 1, n: 3 }), round(1, { shared: 0, n: 4 })], [meta(1, "Pizza")]);
    expect(r.rows[0].shared).toBe(3);
  });

  it("reports dishless rounds instead of distributing them", () => {
    const r = foldDishStats([round(null, { n: 7 }), round(1, { n: 2 })], [meta(1, "Pizza")]);
    expect(r.untracked).toBe(7);
    expect(r.rounds).toBe(2);
    expect(r.rows[0].started).toBe(2);
  });

  it("treats a round pointing at a deleted dish as untracked, not as a nameless row", () => {
    const r = foldDishStats([round(99, { n: 3 }), round(1)], [meta(1, "Pizza")]);
    expect(r.untracked).toBe(3);
    expect(r.rows).toHaveLength(1);
  });

  it("carries the catalogue detail through", () => {
    const r = foldDishStats([round(1)], [meta(1, "Pizza", { times_served: 4, last_served: "2026-08-01" })]);
    expect(r.rows[0]).toMatchObject({ country: "Italy", region: "europe", timesServed: 4, lastServed: "2026-08-01" });
  });

  it("sorts hardest first by loss rate", () => {
    const r = foldDishStats(
      [
        round(1, { solved: 1, n: 9 }), // Pizza: 10% losses
        round(1, { solved: 0, n: 1 }),
        round(2, { solved: 1, n: 5 }), // Ramen: 50% losses
        round(2, { solved: 0, n: 5 }),
      ],
      [meta(1, "Pizza"), meta(2, "Ramen")],
    );
    expect(r.rows.map((d) => d.name)).toEqual(["Ramen", "Pizza"]);
  });

  it("sorts dishes nobody finished last, busiest of those first", () => {
    const r = foldDishStats(
      [
        round(1, { solved: 0, n: 1 }), // measured: 100% losses
        round(2, { completed: 0, solved: null, guesses: null, n: 2 }),
        round(3, { completed: 0, solved: null, guesses: null, n: 8 }),
      ],
      [meta(1, "Pizza"), meta(2, "Ramen"), meta(3, "Tacos")],
    );
    // An unmeasured dish is not a hard one, so neither outranks the real 100%.
    expect(r.rows.map((d) => d.name)).toEqual(["Pizza", "Tacos", "Ramen"]);
  });
});
