import { describe, expect, it } from "vitest";
import { coachBeat, coachingDone } from "./coach";

describe("coachBeat", () => {
  it("shows nothing to a device that has played before", () => {
    expect(coachBeat({ coaching: false, status: "playing", guesses: 0, matches: 0 })).toBeNull();
  });

  it("points at the order bar on an empty board", () => {
    expect(coachBeat({ coaching: true, status: "playing", guesses: 0, matches: 0 })).toBe("order");
  });

  it("switches to the pick beat the moment the list has something in it", () => {
    expect(coachBeat({ coaching: true, status: "playing", guesses: 0, matches: 1 })).toBe("pick");
  });

  it("goes back to the order beat when the list empties again", () => {
    expect(coachBeat({ coaching: true, status: "playing", guesses: 0, matches: 0 })).toBe("order");
  });

  it("explains the first row after one guess, whatever the list says", () => {
    expect(coachBeat({ coaching: true, status: "playing", guesses: 1, matches: 0 })).toBe("read");
    expect(coachBeat({ coaching: true, status: "playing", guesses: 1, matches: 3 })).toBe("read");
  });

  it("stops after the second guess", () => {
    expect(coachBeat({ coaching: true, status: "playing", guesses: 2, matches: 0 })).toBeNull();
    expect(coachBeat({ coaching: true, status: "playing", guesses: 5, matches: 0 })).toBeNull();
  });

  it("stops the moment the round ends, including a win on the first guess", () => {
    expect(coachBeat({ coaching: true, status: "won", guesses: 1, matches: 0 })).toBeNull();
    expect(coachBeat({ coaching: true, status: "lost", guesses: 6, matches: 0 })).toBeNull();
  });
});

describe("coachingDone", () => {
  it("is not done while the first guess is still the only one", () => {
    expect(coachingDone({ status: "playing", guesses: 0 })).toBe(false);
    expect(coachingDone({ status: "playing", guesses: 1 })).toBe(false);
  });

  it("is done on the second guess or at the end of the round", () => {
    expect(coachingDone({ status: "playing", guesses: 2 })).toBe(true);
    expect(coachingDone({ status: "won", guesses: 1 })).toBe(true);
  });
});
