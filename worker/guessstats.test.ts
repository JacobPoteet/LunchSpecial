import { describe, expect, it } from "vitest";
import { foldGuessStats, foldRoundGuesses, TOP_WRONG } from "./guessstats";

const dishes = [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: `Dish ${id}`, country: "Italy" }));
const pair = (t: number, g: number, n: number, opener = 0) => ({
  target_id: t,
  guessed_id: g,
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
      [{ target_id: 1, rounds: 6 }],
      dishes,
      { guesses: 11, rounds: 6, first: "2026-10-08 20:01:00" },
    );
    expect(r.since).toBe("2026-10-08");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ id: 1, guesses: 11, rounds: 6 });
    expect(r.rows[0].topWrong.map((p) => [p.id, p.count])).toEqual([
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
    expect(r.rows.map((x) => x.id)).toEqual([2]);
    expect(r.rows[0].topWrong).toHaveLength(TOP_WRONG);
  });

  it("pools wrong picks across answers and counts openers on guess one only", () => {
    const r = foldGuessStats([pair(1, 2, 3, 1), pair(3, 2, 4), pair(3, 3, 1, 1)], [], dishes, undefined);
    expect(r.decoys).toEqual([{ id: 2, name: "Dish 2", count: 7 }]);
    expect(r.openers.map((p) => [p.id, p.count])).toEqual([
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

describe("foldRoundGuesses", () => {
  const row = (guess_number: number, name: string | null, correct = 0) => ({
    guess_number,
    name,
    country: name ? "Italy" : null,
    correct,
  });

  it("returns the guesses in the order they were made, whatever order they arrive in", () => {
    const r = foldRoundGuesses("round-1", [row(3, "Lasagna", 1), row(1, "Pizza"), row(2, "Risotto")]);
    expect(r.roundId).toBe("round-1");
    expect(r.guesses.map((g) => [g.number, g.name, g.correct])).toEqual([
      [1, "Pizza", false],
      [2, "Risotto", false],
      [3, "Lasagna", true],
    ]);
  });

  it("keeps a guess whose dish has left the catalogue, nameless, rather than dropping it", () => {
    const r = foldRoundGuesses("round-1", [row(1, null)]);
    expect(r.guesses).toEqual([{ number: 1, name: null, country: null, correct: false }]);
  });

  it("is empty for a round the ledger never saw: unmeasured, not zero guesses", () => {
    expect(foldRoundGuesses("round-1", []).guesses).toEqual([]);
  });
});
