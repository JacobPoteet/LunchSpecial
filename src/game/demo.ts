// The browser's half of the demo.
//
// shared/demo.ts holds the vocabulary and the two folds; this is the part that
// reads a URL and talks to the kitchen. Between them they serve both doors —
// the public `/demo` route and the signed `?s=` showcase link — which differ in
// which dish is on the board and in nothing else.
//
// Two rules shape everything below.
//
// **Nothing is written.** No localStorage, no beacon, no stats. A demo link
// forwarded to an actual player must not hand them a won round they did not
// play, and must not overwrite the one they are in the middle of. The dev
// harness (devHarness.ts) makes the opposite choice on purpose — it is seeding
// *your* browser, deliberately, and wants the round to survive a reload.
//
// **The visitor lands on a playable board, not on a finished one.** This used
// to seed a won round before React mounted, so the check opened instantly; that
// was the right shape when the demo existed to show the hand-off into After
// Dark and nothing else, and the wrong one the moment the question became "what
// did you build". The guess feedback, the clue tickets and the guess arc are
// most of the game and a solved board hides all three. The check is now one
// press away instead of zero — see `demoWin` — and everything before it is the
// real thing.

import type { GuessFeedback, RevealInfo } from "../../shared/types";
import { DEMO_SPECIAL_SLUG, demoEntrance, type DemoEntrance } from "../../shared/demo";
import type { RoundState } from "./storage";

/** Which door this page load came through. */
export function currentDemo(): DemoEntrance {
  try {
    return demoEntrance(window.location.pathname, new URLSearchParams(window.location.search));
  } catch {
    return "none";
  }
}

/** The showcase token on this page load, or undefined. */
export function showcaseToken(): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get("s") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The dish a demo entrance pins itself to, if it pins one.
 *
 * The showcase link deliberately pins nothing: it runs on today's real Special,
 * which is the whole difference between a link you send someone now and a link
 * that lives on a resume. See shared/demo.ts.
 */
export function demoPin(entrance: DemoEntrance): string | undefined {
  return entrance === "route" ? DEMO_SPECIAL_SLUG : undefined;
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

/**
 * The round behind "Skip to the check", fetched when the button is pressed.
 *
 * Deliberately not prefetched. The seed used to run before the mount because
 * the board had to be finished at first render, and dropping that requirement
 * dropped the reason: a demo visitor now gets their first paint without waiting
 * on the kitchen, and pays the one request only if they ask to skip.
 *
 * Null if the kitchen doesn't answer, which leaves the visitor on the board
 * they were already playing — a legible failure rather than a broken one.
 */
export async function demoWin(
  date: string,
  pin: string | undefined,
  random: string | undefined,
): Promise<RoundState | null> {
  // The same three parameters the board itself was resolved from. A demo can be
  // sitting on a Chef's Choice (its own hops stay inside it), and asking the
  // kitchen for the date alone there would answer with today's Special — a
  // different dish from the one in the grid, on the check and in the share text.
  const qs = new URLSearchParams({ date });
  if (pin) qs.set("special", pin);
  if (random) qs.set("random", random);
  try {
    const res = await fetch(`/api/reveal?${qs.toString()}`);
    if (!res.ok) return null;
    return wonRoundFromReveal((await res.json()) as RevealInfo, date);
  } catch {
    return null;
  }
}
