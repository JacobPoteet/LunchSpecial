/**
 * What a screen reader hears when a guess lands.
 *
 * Submitting a guess changes the board in three places at once — a row prepends
 * to the guess column, the tally drops a pip, and a clue ticket prints about a
 * second later — and none of them is announced by simply existing. Putting
 * `aria-live` on the guess column itself would read the whole row out (name,
 * four tiles, every chip) in DOM order, which isn't a sentence; so the page
 * keeps two hidden live regions and this module decides what goes in them.
 *
 * It's a pure fold for the usual reason: the wording is the whole feature, and
 * a string is the one part of an accessibility fix a unit test can actually
 * hold. Nothing here reads the target dish — the same rule the board follows.
 */

import type { AttributeFeedback, DrinkAttributeFeedback, DrinkGuessFeedback, GuessFeedback, MatchLevel } from "./types";

/**
 * The verdict, in words. Also what the tiles carry in their own hidden text
 * node, so a tile read on its own ("Country, Italy, close") and the summary
 * read here can't describe the same square two different ways.
 */
export const MATCH_WORDS: Record<MatchLevel, string> = {
  hit: "match",
  near: "close",
  miss: "no match",
};

/**
 * The redundant visual channel for the same three states — the thing that makes
 * a tile readable without seeing its colour (WCAG 1.4.1). Kept beside the words
 * so the two can never drift apart.
 */
export const MATCH_MARKS: Record<MatchLevel, string> = {
  hit: "✓",
  near: "~",
  miss: "×",
};

/** Tile order on the board, left to right. */
const ATTRIBUTES: Array<[keyof AttributeFeedback, string]> = [
  ["country", "country"],
  ["course", "course"],
  ["temperature", "served"],
  ["protein", "protein"],
];

/** "1 guess" / "3 guesses" — the word is irregular, so both forms are named. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * One guess, as a sentence.
 *
 * A win says so first and stops — the four tiles are all hits and reading them
 * out delays the only fact that matters. A miss leads with which guess this was
 * (position is the thing you lose track of without the board in front of you),
 * then the ingredient count, then the tiles in the order they're drawn, and
 * closes with what's left.
 */
export function guessAnnouncement(input: {
  guess: GuessFeedback;
  ingredientCount: number;
  guessNumber: number;
  maxGuesses: number;
}): string {
  const { guess, ingredientCount, guessNumber, maxGuesses } = input;
  const name = guess.dish.name;
  if (guess.correct) {
    return `${name} is the Special. Solved in ${count(guessNumber, "guess", "guesses")}.`;
  }

  const tiles = ATTRIBUTES.map(([key, label]) => {
    const cell = guess.attributes[key];
    return `${label} ${MATCH_WORDS[cell.match]}`;
  }).join(", ");

  const remaining = maxGuesses - guessNumber;
  const tail =
    remaining === 0
      ? "No guesses left."
      : `${count(remaining, "guess", "guesses")} left.`;

  return (
    `Guess ${guessNumber} of ${maxGuesses}: ${name}. ` +
    `${guess.matchedIngredients.length} of ${ingredientCount} ingredients match. ` +
    `${tiles}. ${tail}`
  );
}

/**
 * The clue ticket, announced on its own about a second after the guess (see
 * TICKET_MS in shared/audio.ts). Two live regions rather than one because the
 * stagger is deliberate and a single region updated twice in quick succession
 * drops the first message.
 */
export function clueAnnouncement(index: number, text: string): string {
  return `Clue ${index}: ${text}`;
}

// ---- After Dark ----
//
// The bar's board changes in the same three places and needs the same two
// sentences. Two of the four tiles differ, the noun is a drink rather than a
// dish, and the paper is a coaster rather than a ticket -- so the wording is
// its own fold rather than a parameterised version of the one above, which
// would have ended up taking a label table, a noun and a verb to save eight
// lines.

/** Tile order on the bar's board, left to right. */
const DRINK_ATTRIBUTES: Array<[keyof DrinkAttributeFeedback, string]> = [
  ["country", "country"],
  ["spirit", "base spirit"],
  ["temperature", "served"],
  ["profile", "profile"],
];

/**
 * One Nightcap guess, as a sentence.
 *
 * Says "the Nightcap", never the drink's name on a win beyond the one already
 * guessed -- the same rule the board follows, and the reason a screen reader
 * user hears exactly what a sighted player sees.
 */
export function drinkGuessAnnouncement(input: {
  guess: DrinkGuessFeedback;
  ingredientCount: number;
  guessNumber: number;
  maxGuesses: number;
}): string {
  const { guess, ingredientCount, guessNumber, maxGuesses } = input;
  const name = guess.drink.name;
  if (guess.correct) {
    return `${name} is tonight's Nightcap. Solved in ${count(guessNumber, "guess", "guesses")}.`;
  }

  const tiles = DRINK_ATTRIBUTES.map(([key, label]) => {
    const cell = guess.attributes[key];
    return `${label} ${MATCH_WORDS[cell.match]}`;
  }).join(", ");

  const remaining = maxGuesses - guessNumber;
  const tail = remaining === 0 ? "No guesses left." : `${count(remaining, "guess", "guesses")} left.`;

  return (
    `Guess ${guessNumber} of ${maxGuesses}: ${name}. ` +
    `${guess.matchedIngredients.length} of ${ingredientCount} ingredients match. ` +
    `${tiles}. ${tail}`
  );
}

/** The coaster, announced on its own once it has slid across the bar. */
export function coasterAnnouncement(index: number, text: string): string {
  return `Coaster ${index}: ${text}`;
}
