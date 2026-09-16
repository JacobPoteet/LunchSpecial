import { describe, expect, it } from "vitest";
import { SMALL_SAMPLE_MIN } from "./sample";
import { foldTally, modalGuess, tallyLine, type TallyRow } from "./tally";
import { MAX_GUESSES } from "./types";

const solvedIn = (n: number, times = 1): TallyRow[] => Array.from({ length: times }, () => ({ guesses: n, solved: 1 }));
const failed = (times = 1): TallyRow[] => Array.from({ length: times }, () => ({ guesses: MAX_GUESSES, solved: 0 }));

describe("foldTally", () => {
  it("counts finishes, solves, and buckets solves by guess count", () => {
    const t = foldTally([...solvedIn(2, 3), ...solvedIn(4), ...failed(2)], MAX_GUESSES);
    expect(t).toEqual({ finished: 6, solved: 4, distribution: [0, 3, 0, 1, 0, 0] });
  });

  it("is always maxGuesses wide, even with nothing in it", () => {
    expect(foldTally([], MAX_GUESSES).distribution).toHaveLength(MAX_GUESSES);
    expect(foldTally([], 4).distribution).toHaveLength(4);
  });

  it("counts a solve with an impossible guess count but places it nowhere", () => {
    const t = foldTally([{ guesses: 9, solved: 1 }], MAX_GUESSES);
    expect(t.solved).toBe(1);
    expect(t.distribution.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("modalGuess", () => {
  it("names the guess count most solves landed on", () => {
    expect(modalGuess({ finished: 5, solved: 5, distribution: [1, 3, 1, 0, 0, 0] })).toBe(2);
  });

  it("keeps the earlier count on a tie", () => {
    expect(modalGuess({ finished: 4, solved: 4, distribution: [0, 2, 0, 2, 0, 0] })).toBe(2);
  });

  it("is null when nobody solved it", () => {
    expect(modalGuess({ finished: 40, solved: 0, distribution: [0, 0, 0, 0, 0, 0] })).toBeNull();
  });
});

describe("tallyLine", () => {
  const enough = SMALL_SAMPLE_MIN;

  it("prints nothing under the sample floor, not a hedge", () => {
    const t = foldTally([...solvedIn(3, enough - 1)], MAX_GUESSES);
    expect(tallyLine(t)).toBeNull();
  });

  it("quotes the share of finishers and the modal guess", () => {
    const t = foldTally([...solvedIn(3, 24), ...solvedIn(2, 6), ...failed(10)], MAX_GUESSES);
    expect(tallyLine(t)).toBe("75% of diners got today's Special · most in 3");
  });

  it("drops the modal guess when nobody got it", () => {
    const t = foldTally(failed(enough), MAX_GUESSES);
    expect(tallyLine(t)).toBe("0% of diners got today's Special.");
  });

  it("measures against finishes, not against solves", () => {
    const t = foldTally([...solvedIn(1, 15), ...failed(15)], MAX_GUESSES);
    expect(tallyLine(t)).toMatch(/^50%/);
  });
});
