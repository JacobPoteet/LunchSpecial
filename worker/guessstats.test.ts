import { describe, expect, it } from "vitest";
import { foldGuessStats, TOP_WRONG } from "./guessstats";

const dishes = [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: `Dish ${id}`, country: "Italy" }));
const pair = (t: number, g: number, n: number, opener = 0) => ({
  target_dish_id: t,
  guessed_dish_id: g,
  opener,
  n,
});

describe("foldGuessStats", () => {
  it("is empty and honest with no rows", () => {
    const r = foldGuessStats([], [], dishes, undefined);
    expect(r).toEqual({ guesses: 0, rounds: 0, since: null, rows: [], decoys: [], openers: [] });
  });

  it("lists the wrong picks per answer and leaves the right one out", () => {
    const r = foldGuessStats(
      [pair(1, 1, 4), pair(1, 2, 5), pair(1, 3, 2)],
      [{ target_dish_id: 1, rounds: 6 }],
      dishes,
      { guesses: 11, rounds: 6, first: "2026-10-08 20:01:00" },
    );
    expect(r.since).toBe("2026-10-08");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ dishId: 1, guesses: 11, rounds: 6 });
    expect(r.rows[0].topWrong.map((p) => [p.dishId, p.count])).toEqual([
      [2, 5],
      [3, 2],
    ]);
  });

  it("drops an answer nobody missed, and caps each list", () => {
    const r = foldGuessStats(
      [pair(1, 1, 9), pair(2, 3, 1), pair(2, 4, 1), pair(2, 5, 1), pair(2, 6, 1)],
      [],
      dishes,
      undefined,
    );
    expect(r.rows.map((x) => x.dishId)).toEqual([2]);
    expect(r.rows[0].topWrong).toHaveLength(TOP_WRONG);
  });

  it("pools wrong picks across answers and counts openers on guess one only", () => {
    const r = foldGuessStats([pair(1, 2, 3, 1), pair(3, 2, 4), pair(3, 3, 1, 1)], [], dishes, undefined);
    expect(r.decoys).toEqual([{ dishId: 2, name: "Dish 2", count: 7 }]);
    expect(r.openers.map((p) => [p.dishId, p.count])).toEqual([
      [2, 3],
      [3, 1],
    ]);
  });

  it("skips a dish deleted from the catalogue instead of inventing a name", () => {
    const r = foldGuessStats([pair(1, 99, 5), pair(98, 2, 5)], [], dishes, undefined);
    expect(r.rows).toEqual([]);
    expect(r.decoys).toEqual([]);
  });
});
