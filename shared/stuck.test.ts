import { describe, expect, it } from "vitest";
import { isStuck, STUCK_AFTER } from "./stuck";
import type { MatchLevel } from "./types";

const guess = (country: MatchLevel, matched: string[] = [], correct = false) => ({
  correct,
  matchedIngredients: matched,
  attributes: { country: { value: "x", match: country } } as never,
});

describe("isStuck", () => {
  it("waits for the second guess", () => {
    expect(STUCK_AFTER).toBe(2);
    expect(isStuck([])).toBe(false);
    expect(isStuck([guess("miss")])).toBe(false);
  });

  it("fires when two guesses found neither a country nor an ingredient", () => {
    expect(isStuck([guess("miss"), guess("miss")])).toBe(true);
    expect(isStuck([guess("miss"), guess("miss"), guess("miss")])).toBe(true);
  });

  it("stays quiet once any guess matched an ingredient", () => {
    expect(isStuck([guess("miss"), guess("miss", ["egg"])])).toBe(false);
  });

  it("stays quiet once any guess was in the right region or country", () => {
    expect(isStuck([guess("near"), guess("miss")])).toBe(false);
    expect(isStuck([guess("miss"), guess("hit")])).toBe(false);
  });

  it("is never about a won round", () => {
    expect(isStuck([guess("miss"), guess("hit", [], true)])).toBe(false);
  });
});
