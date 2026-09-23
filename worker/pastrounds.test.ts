import { describe, expect, it } from "vitest";
import { EPOCH_DATE } from "../shared/types";
import { RECOVER_THROUGH, foldPastRounds, type PastRoundRow } from "./pastrounds";

const row = (play_date: string, solved: number | null, guesses: number | null): PastRoundRow => ({
  play_date,
  solved,
  guesses,
});

const TODAY = "2026-09-23";

describe("foldPastRounds", () => {
  it("returns one outcome per day, oldest first", () => {
    expect(foldPastRounds([row("2026-09-20", 0, 6), row("2026-09-18", 1, 3)], TODAY)).toEqual([
      { date: "2026-09-18", solved: true, guesses: 3 },
      { date: "2026-09-20", solved: false, guesses: 6 },
    ]);
  });

  it("prefers a solve over a miss on the same day, whatever the order", () => {
    const rows = [row("2026-09-20", 0, 6), row("2026-09-20", 1, 5)];
    expect(foldPastRounds(rows, TODAY)).toEqual([{ date: "2026-09-20", solved: true, guesses: 5 }]);
    expect(foldPastRounds([...rows].reverse(), TODAY)).toEqual([{ date: "2026-09-20", solved: true, guesses: 5 }]);
  });

  it("prefers fewer guesses between two solves", () => {
    expect(foldPastRounds([row("2026-09-20", 1, 4), row("2026-09-20", 1, 2)], TODAY)).toEqual([
      { date: "2026-09-20", solved: true, guesses: 2 },
    ]);
  });

  it("leaves out today and anything later: the device already has today's round", () => {
    expect(foldPastRounds([row(TODAY, 1, 2), row("2026-09-24", 1, 2)], TODAY)).toEqual([]);
  });

  it("leaves out dates before the first Special", () => {
    expect(foldPastRounds([row("2026-07-16", 1, 2), row(EPOCH_DATE, 1, 2)], TODAY)).toEqual([
      { date: EPOCH_DATE, solved: true, guesses: 2 },
    ]);
  });

  it("stops at RECOVER_THROUGH, the day the archive started keeping the rest", () => {
    const later = "2026-12-01";
    const rows = [row(RECOVER_THROUGH, 1, 4), row("2026-10-15", 1, 2)];
    expect(foldPastRounds(rows, later)).toEqual([{ date: RECOVER_THROUGH, solved: true, guesses: 4 }]);
  });

  it("drops an impossible guess count rather than clamping it", () => {
    expect(foldPastRounds([row("2026-09-20", 1, 0), row("2026-09-19", 1, 7), row("2026-09-18", 1, null)], TODAY)).toEqual(
      [],
    );
  });

  it("reads a NULL solved as a miss", () => {
    expect(foldPastRounds([row("2026-09-20", null, 6)], TODAY)).toEqual([{ date: "2026-09-20", solved: false, guesses: 6 }]);
  });
});
