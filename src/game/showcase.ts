// The browser's half of the showcase link.
//
// `?showcase=<token>` opens the game on a finished, won Special with the bar's
// invitation already lit. It is the link you hand somebody who has never played
// and has five minutes: it lifts the clock, the finish-lunch gate and the
// one-round-a-day rule at once, and what it puts in front of them is the
// hand-off from the check into After Dark — the part of this game that is
// otherwise hardest to reach and most worth seeing.
//
// Two rules shape everything below.
//
// **Nothing is written.** The seeded round lives in a module variable and never
// reaches localStorage. A showcase link that is forwarded to an actual player
// must not hand them a won round they did not play, and must not overwrite the
// one they are in the middle of. The dev harness (devHarness.ts) makes the
// opposite choice on purpose — it is seeding *your* browser, deliberately, and
// wants the round to survive a reload.
//
// **It runs before React mounts.** GamePage reads its round in a useState
// initialiser, and a round that is already finished at first render opens its
// check instantly instead of replaying a victory lap for a win the viewer never
// saw happen (see restoredFinished in roundLifecycle.ts). Seeding after mount
// would run the full win choreography over an empty board.

import type { GuessFeedback, RevealInfo } from "../../shared/types";
import { gameToday } from "../../shared/time";
import type { RoundState } from "./storage";

/** The token on this page load, or undefined. */
export function showcaseToken(): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get("showcase") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * A won round built from a real reveal.
 *
 * Shared with the dev harness rather than written twice: both exist to put a
 * *coherent* finished board on screen — the same dish in the grid, in the share
 * text and on the check — and a second copy of this shape is a second copy to
 * keep in step with GuessFeedback.
 */
export function wonRoundFromReveal(reveal: RevealInfo, date: string): RoundState {
  const winning: GuessFeedback = {
    correct: true,
    dish: { id: reveal.id, name: reveal.name },
    matchedIngredients: reveal.ingredients,
    unmatchedIngredients: [],
    attributes: {
      country: { value: reveal.country, match: "hit" },
      course: { value: reveal.course, match: "hit" },
      temperature: { value: reveal.temperature, match: "hit" },
      protein: { value: reveal.protein, match: "hit" },
    },
  };
  return {
    date,
    status: "won",
    guesses: [winning],
    clues: [],
    ingredientCount: reveal.ingredients.length,
  };
}

let seeded: RoundState | null = null;

/**
 * The round the showcase seeded, if it seeded one.
 *
 * Read from GamePage's useState initialiser. Null on every ordinary page load,
 * and null too when the link is live but the kitchen did not answer — in which
 * case the visitor gets an ordinary unplayed board, which is a legible failure
 * rather than a broken one.
 */
export function seededShowcaseRound(): RoundState | null {
  return seeded;
}

/**
 * Fetch today's Special and stash a won round for the mount to pick up.
 *
 * The token is not verified here and does not need to be: everything this does
 * on its own is cosmetic, and the only thing it unlocks — the bar, past its
 * clock — is resolved by the Worker against the signature on every request. A
 * forged `?showcase=` value seeds a check and then gets "Invalid or expired
 * preview link" at the door.
 */
export async function applyShowcase(): Promise<void> {
  if (!showcaseToken()) return;
  const today = gameToday();
  try {
    const res = await fetch(`/api/reveal?date=${today}`);
    if (!res.ok) return;
    seeded = wonRoundFromReveal((await res.json()) as RevealInfo, today);
  } catch {
    // See seededShowcaseRound: an unplayed board is the fallback.
  }
}
