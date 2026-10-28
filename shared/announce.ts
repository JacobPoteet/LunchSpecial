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

import type { Messages } from "./i18n/messages";
import type {
  AttributeFeedback,
  DrinkAttributeFeedback,
  DrinkGuessFeedback,
  GuessFeedback,
  MatchLevel,
  Region,
} from "./types";

// The verdict in words (`t.announce.match`) is also what the tiles carry in
// their own hidden text node, so a tile read on its own ("Country, Italy,
// close") and the summary read here can't describe the same square two ways.

/**
 * The redundant visual channel for the same three states — the thing that makes
 * a tile readable without seeing its colour (WCAG 1.4.1). Glyphs, so the same
 * in every language.
 */
export const MATCH_MARKS: Record<MatchLevel, string> = {
  hit: "✓",
  near: "~",
  miss: "×",
};

/** Tile order on the board, left to right. */
const ATTRIBUTES: Array<keyof AttributeFeedback> = ["country", "course", "temperature", "protein"];

/**
 * What a near country tile adds: the region the game means. The eye gets the
 * same words on a second line of the tile (see AttrTile), so a screen reader
 * hears exactly what a sighted player reads, which is the whole rule.
 */
export function regionAside(key: string, cell: { match: MatchLevel; region?: Region }, t: Messages): string {
  if (key !== "country" || cell.match !== "near" || !cell.region) return "";
  return t.announce.region(t.regions[cell.region]);
}

/**
 * ", 2 close" after the ingredient count, or nothing. A close ingredient is a
 * different one of the same family as something in the Special, and a listener
 * needs the number for the same reason a sighted player gets the chips.
 */
function closeAside(guess: { nearIngredients?: unknown[] }, t: Messages): string {
  const n = guess.nearIngredients?.length ?? 0;
  return n > 0 ? t.announce.close(n) : "";
}

/** The tiles, in board order, as one comma-run phrase. */
function tilesPhrase<K extends string>(
  keys: ReadonlyArray<K>,
  labels: Record<K, string>,
  attributes: Record<K, { match: MatchLevel; region?: Region }>,
  t: Messages,
): string {
  return keys
    .map((key) => {
      const cell = attributes[key];
      return t.announce.tile(labels[key], t.announce.match[cell.match]) + regionAside(key, cell, t);
    })
    .join(", ");
}

/** A miss, as the sentence both boards say it. */
function missSentence(
  guess: { matchedIngredients: unknown[]; nearIngredients?: unknown[] },
  name: string,
  tiles: string,
  input: { ingredientCount: number; guessNumber: number; maxGuesses: number },
  t: Messages,
): string {
  const { ingredientCount, guessNumber, maxGuesses } = input;
  return (
    `${t.announce.head(guessNumber, maxGuesses, name)} ` +
    `${t.announce.ingredients(guess.matchedIngredients.length, ingredientCount)}${closeAside(guess, t)}. ` +
    `${tiles}. ${t.announce.left(maxGuesses - guessNumber)}`
  );
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
export function guessAnnouncement(
  input: {
    guess: GuessFeedback;
    ingredientCount: number;
    guessNumber: number;
    maxGuesses: number;
  },
  t: Messages,
): string {
  const { guess } = input;
  const name = guess.dish.name;
  if (guess.correct) return t.announce.solved(name, input.guessNumber);
  const tiles = tilesPhrase(ATTRIBUTES, t.announce.dishTiles, guess.attributes, t);
  return missSentence(guess, name, tiles, input, t);
}

/**
 * The clue ticket, announced on its own about a second after the guess (see
 * TICKET_MS in shared/audio.ts). Two live regions rather than one because the
 * stagger is deliberate and a single region updated twice in quick succession
 * drops the first message.
 */
export function clueAnnouncement(index: number, text: string, t: Messages): string {
  return t.announce.clue(index, text);
}

// ---- After Dark ----
//
// The bar's board changes in the same three places and needs the same two
// sentences. Two of the four tiles differ, the noun is a drink rather than a
// dish, and the paper is a coaster rather than a ticket -- so the wording is
// its own entry point. The sentence around the tiles is shared (missSentence).

/** Tile order on the bar's board, left to right. */
const DRINK_ATTRIBUTES: Array<keyof DrinkAttributeFeedback> = ["country", "spirit", "temperature", "profile"];

/**
 * One Nightcap guess, as a sentence.
 *
 * Says "the Nightcap", never the drink's name on a win beyond the one already
 * guessed -- the same rule the board follows, and the reason a screen reader
 * user hears exactly what a sighted player sees.
 */
export function drinkGuessAnnouncement(
  input: {
    guess: DrinkGuessFeedback;
    ingredientCount: number;
    guessNumber: number;
    maxGuesses: number;
  },
  t: Messages,
): string {
  const { guess } = input;
  const name = guess.drink.name;
  if (guess.correct) return t.announce.solvedNightcap(name, input.guessNumber);
  const tiles = tilesPhrase(DRINK_ATTRIBUTES, t.announce.drinkTiles, guess.attributes, t);
  return missSentence(guess, name, tiles, input, t);
}

/** The coaster, announced on its own once it has slid across the bar. */
export function coasterAnnouncement(index: number, text: string, t: Messages): string {
  return t.announce.coaster(index, text);
}

// ---- The Kids' Menu ----
//
// The card changes in two ways a sighted player sees at once: it opens on its
// list, and a name gets a crayon ring round it. Each is said in one short
// sentence in the card's own live region. Never a word about which dish is the
// Special: the card doesn't know, and neither does this.

/**
 * "Kids' Menu: 9 dishes, East Asia, entree, hot and pork." Said when the card
 * opens on its list. With no confirmed fact (every tile a miss) the misses
 * still narrowed it, so it says what's left rather than "the whole menu".
 */
export function kidsMenuAnnouncement(dishes: number, filters: ReadonlyArray<string>, t: Messages): string {
  if (filters.length === 0) return t.announce.kidsMenuAll(dishes);
  return t.announce.kidsMenu(dishes, t.and(filters));
}

export function circleAnnouncement(name: string, t: Messages): string {
  return t.announce.circled(name);
}
