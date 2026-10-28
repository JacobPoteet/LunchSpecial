import { describe, expect, it } from "vitest";
import en from "./i18n/locales/en";
import { CATALOGS } from "./i18n/catalogs";
import { buildPresence, PRESENCE_TEXT_LIMIT, type PresenceInput } from "./presence";
import { MAX_GUESSES, ROUND_KINDS } from "./types";

const base: PresenceInput = { kind: "daily", puzzleNumber: 26, status: "playing", guesses: 0 };

describe("buildPresence", () => {
  it("names the mode the player is in", () => {
    expect(buildPresence({ ...base, kind: "daily" }, en).details).toBe("Today's Special · No. 26");
    expect(buildPresence({ ...base, kind: "leftover", puzzleNumber: 12 }, en).details).toBe("Leftovers · No. 12");
    expect(buildPresence({ ...base, kind: "random", puzzleNumber: 0 }, en).details).toBe("Chef's Choice");
  });

  // An unnumbered round would otherwise advertise "No. 0".
  it("drops the number when the round hasn't got one", () => {
    expect(buildPresence({ ...base, puzzleNumber: 0 }, en).details).toBe("Today's Special");
  });

  it("counts the guess they're on, not the ones they've used", () => {
    expect(buildPresence({ ...base, guesses: 0 }, en).state).toBe("Reading the menu");
    expect(buildPresence({ ...base, guesses: 1 }, en).state).toBe(`Guess 2 of ${MAX_GUESSES}`);
    expect(buildPresence({ ...base, guesses: 5 }, en).state).toBe(`Guess 6 of ${MAX_GUESSES}`);
  });

  // The last guess is submitted at guesses = MAX; nothing should read "Guess 7 of 6"
  // in the beat between that landing and the status flipping.
  it("never counts past the last guess", () => {
    expect(buildPresence({ ...base, guesses: MAX_GUESSES }, en).state).toBe(`Guess ${MAX_GUESSES} of ${MAX_GUESSES}`);
  });

  it("reports the result once the round is over", () => {
    expect(buildPresence({ ...base, status: "won", guesses: 4 }, en).state).toBe("Solved it in 4 guesses");
    expect(buildPresence({ ...base, status: "won", guesses: 1 }, en).state).toBe("Solved it in 1 guess");
    expect(buildPresence({ ...base, status: "lost", guesses: 6 }, en).state).toBe("Out of guesses");
  });

  it("runs the elapsed timer only while the round is live", () => {
    const startedAt = 1_700_000_000_000;
    expect(buildPresence({ ...base, startedAt }, en).timestamps).toEqual({ start: startedAt });
    expect(buildPresence({ ...base, status: "won", guesses: 3, startedAt }, en).timestamps).toBeUndefined();
    expect(buildPresence({ ...base, status: "lost", guesses: 6, startedAt }, en).timestamps).toBeUndefined();
  });

  it("omits the timer when there's no honest start time", () => {
    expect(buildPresence(base, en).timestamps).toBeUndefined();
  });

  // The one thing this module must never do: a profile is read by people who
  // haven't played today, so no output may contain anything dish-shaped. In
  // every language: a translation is free text too.
  it.each(Object.entries(CATALOGS))("says nothing about the dish, in any state (%s)", (_, t) => {
    const states: PresenceInput["status"][] = ["playing", "won", "lost"];
    // Every kind, read off the enum rather than listed: a new mode's label is
    // exactly the kind of free text this test exists to catch, and a hardcoded
    // list would have let After Dark's in without comment.
    for (const kind of ROUND_KINDS) {
      for (const status of states) {
        for (let guesses = 0; guesses <= MAX_GUESSES; guesses++) {
          const { details, state } = buildPresence({ kind, puzzleNumber: 26, status, guesses }, t);
          expect(details.length).toBeLessThanOrEqual(PRESENCE_TEXT_LIMIT);
          expect(state.length).toBeLessThanOrEqual(PRESENCE_TEXT_LIMIT);
          // Nothing is interpolated but the mode label and the counts, so the
          // guard that matters is that no free text ever reaches these lines.
          expect(`${details} ${state}`).toMatch(/^[\p{L}\p{N}'’·.\s[\]~]+$/u);
        }
      }
    }
  });
});
