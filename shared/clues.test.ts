import { describe, expect, it } from "vitest";
import { CLUE_BEATS, clueBeat } from "./clues";

describe("clue beats", () => {
  it("has five beats, ordered 1 to 5", () => {
    expect(CLUE_BEATS.map((b) => b.beat)).toEqual([1, 2, 3, 4, 5]);
  });

  it("indexes by order_index and returns nothing outside the range", () => {
    expect(clueBeat(1)?.name).toBe("Broad geography");
    expect(clueBeat(5)?.name).toBe("Near-giveaway");
    expect(clueBeat(0)).toBeUndefined();
    expect(clueBeat(6)).toBeUndefined();
  });

  // The editor's three states (quiet / warn / over) collapse into two if a
  // band's ceiling is not above its target, so a clue could never read as
  // merely long.
  it("keeps every band ordered lo < hi < max", () => {
    for (const b of CLUE_BEATS) {
      expect(b.lo, `beat ${b.beat} lo < hi`).toBeLessThan(b.hi);
      expect(b.hi, `beat ${b.beat} hi < max`).toBeLessThan(b.max);
    }
  });

  it("gives every beat a name and a job", () => {
    for (const b of CLUE_BEATS) {
      expect(b.name.length, `beat ${b.beat} name`).toBeGreaterThan(0);
      expect(b.job.length, `beat ${b.beat} job`).toBeGreaterThan(0);
    }
  });

  /**
   * A finished set runs 300–500 characters, and anything over 565 is broken
   * regardless of how good the sentences are, because the player reads all
   * five on a 375px board between guesses. The ceilings have to leave that
   * claim reachable, so the sum of the target highs is the number to watch.
   */
  it("keeps a full set inside the board's budget", () => {
    const targets = CLUE_BEATS.reduce((n, b) => n + b.hi, 0);
    expect(targets).toBeLessThanOrEqual(565);
  });
});
