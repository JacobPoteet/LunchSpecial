import { describe, expect, it } from "vitest";
import { buildPresence, PRESENCE_TEXT_LIMIT, type PresenceInput } from "./presence";
import { MAX_GUESSES } from "./types";

const base: PresenceInput = { kind: "daily", puzzleNumber: 26, status: "playing", guesses: 0 };

describe("buildPresence", () => {
  it("names the mode the player is in", () => {
    expect(buildPresence({ ...base, kind: "daily" }).details).toBe("Today's Special · No. 26");
    expect(buildPresence({ ...base, kind: "leftover", puzzleNumber: 12 }).details).toBe("Leftovers · No. 12");
    expect(buildPresence({ ...base, kind: "random", puzzleNumber: 0 }).details).toBe("Chef's Choice");
  });

  // An unnumbered round would otherwise advertise "No. 0".
  it("drops the number when the round hasn't got one", () => {
    expect(buildPresence({ ...base, puzzleNumber: 0 }).details).toBe("Today's Special");
  });

  it("counts the guess they're on, not the ones they've used", () => {
    expect(buildPresence({ ...base, guesses: 0 }).state).toBe("Reading the menu");
    expect(buildPresence({ ...base, guesses: 1 }).state).toBe(`Guess 2 of ${MAX_GUESSES}`);
    expect(buildPresence({ ...base, guesses: 5 }).state).toBe(`Guess 6 of ${MAX_GUESSES}`);
  });

  // The last guess is submitted at guesses = MAX; nothing should read "Guess 7 of 6"
  // in the beat between that landing and the status flipping.
  it("never counts past the last guess", () => {
    expect(buildPresence({ ...base, guesses: MAX_GUESSES }).state).toBe(`Guess ${MAX_GUESSES} of ${MAX_GUESSES}`);
  });

  it("reports the result once the round is over", () => {
    expect(buildPresence({ ...base, status: "won", guesses: 4 }).state).toBe("Solved it in 4 guesses");
    expect(buildPresence({ ...base, status: "won", guesses: 1 }).state).toBe("Solved it in 1 guess");
    expect(buildPresence({ ...base, status: "lost", guesses: 6 }).state).toBe("Out of guesses");
  });

  it("runs the elapsed timer only while the round is live", () => {
    const startedAt = 1_700_000_000_000;
    expect(buildPresence({ ...base, startedAt }).timestamps).toEqual({ start: startedAt });
    expect(buildPresence({ ...base, status: "won", guesses: 3, startedAt }).timestamps).toBeUndefined();
    expect(buildPresence({ ...base, status: "lost", guesses: 6, startedAt }).timestamps).toBeUndefined();
  });

  it("omits the timer when there's no honest start time", () => {
    expect(buildPresence(base).timestamps).toBeUndefined();
  });

  // The one thing this module must never do: a profile is read by people who
  // haven't played today, so no output may contain anything dish-shaped.
  it("says nothing about the dish, in any state", () => {
    const states: PresenceInput["status"][] = ["playing", "won", "lost"];
    for (const kind of ["daily", "leftover", "random"] as const) {
      for (const status of states) {
        for (let guesses = 0; guesses <= MAX_GUESSES; guesses++) {
          const { details, state } = buildPresence({ kind, puzzleNumber: 26, status, guesses });
          expect(details.length).toBeLessThanOrEqual(PRESENCE_TEXT_LIMIT);
          expect(state.length).toBeLessThanOrEqual(PRESENCE_TEXT_LIMIT);
          // Nothing is interpolated but the mode label and the counts, so the
          // guard that matters is that no free text ever reaches these lines.
          expect(`${details} ${state}`).toMatch(/^[A-Za-z0-9'·.\s]+$/);
        }
      }
    }
  });
});
