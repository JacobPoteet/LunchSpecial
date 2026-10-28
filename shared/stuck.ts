// When a player has guessed twice and learned nothing — PURE.
//
// The clue ticket is the game's best teacher and the easiest thing to skip:
// players read the tiles, see a few green course and temperature squares, and
// guess again from those. Two guesses that land neither the country nor a
// single ingredient is the moment a nudge toward the ticket helps, and the only
// moment, because anyone with a foothold is already reading the board.
//
// Country and ingredients are the two signals worth the test. Course, served
// and protein are four- and two-way splits, so a green one is closer to luck
// than to a foothold, and counting them would almost never fire.

import type { GuessFeedback } from "./types";

/** Guesses it takes before a blank board earns the nudge. */
export const STUCK_AFTER = 2;

// What the nudge says is `t.stuck`: a fragment that names no dish and no clue's content.

type Probe = Pick<GuessFeedback, "correct" | "matchedIngredients" | "attributes">;

export function isStuck(guesses: ReadonlyArray<Probe>): boolean {
  if (guesses.length < STUCK_AFTER) return false;
  return guesses.every(
    (g) => !g.correct && g.matchedIngredients.length === 0 && g.attributes.country.match === "miss",
  );
}
