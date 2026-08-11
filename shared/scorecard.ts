// The shareable score card — PURE.
//
// Inside the Discord Activity a finished round can be posted straight into the
// channel as an image (Discord's share-moment dialog takes a picture, not text).
// This module is the fold from a finished round to what that picture says; the
// drawing lives in src/game/scorecard.ts and the Discord plumbing in
// src/discord/share.ts.
//
// It is the emoji grid `buildShareText()` produces, in a form a renderer can lay
// out: the same four attribute tiles per guess and the same pantry count, minus
// the decision about which glyph stands for which colour. Text and picture are
// two presentations of one score, so they are folded from the same inputs and
// must not drift — a player who copies the text and a player who posts the card
// are sharing the same round.
//
// One rule governs every string here, the same one that governs presence: **it
// never names the dish.** A card lands in a channel where most people haven't
// played yet, so the answer, the dishes that were guessed and the clues are all
// barred. Tile colours and counts are safe; they say how it went, not what it
// was.

import type { GuessFeedback, MatchLevel } from "./types";
import { MAX_GUESSES } from "./types";

/** One guess: how its four attributes landed, and how much of the pantry it hit. */
export interface ScorecardRow {
  /** Country, course, temperature, protein — always four, always in that order. */
  tiles: MatchLevel[];
  /**
   * Matched ingredients as "3/7", or "" on the winning guess, where the count is
   * a foregone conclusion and the row has the bell instead.
   */
  pantry: string;
  /** The guess that ended the round. Drawn as the bell, not as a count. */
  correct: boolean;
}

/** Everything the card puts on screen. No field is free text. */
export interface Scorecard {
  /** The diner's name, not the dish's. */
  title: string;
  /** "No. 26 · 4/6" — which Special, and how it went. */
  subtitle: string;
  rows: ScorecardRow[];
  /** Where to go and play it. */
  footer: string;
}

/** Printed along the bottom so a card that gets forwarded still says where it's from. */
export const SCORECARD_FOOTER = "lunchspecial.app";

const TITLE = "Lunch Special";

/**
 * The one line of text above the card in the channel.
 *
 * Present tense while the round is live and past tense once it's over, because
 * the message is edited in place and stays in the channel afterwards — "is
 * playing" on a round that finished an hour ago is the message lying about the
 * present. It's `content` rather than part of the embed for a mechanical reason
 * too: Discord replaces embeds wholesale on edit, so the tense and the author
 * line have to live in different fields or changing one would mean re-sending
 * the other (and therefore storing the player's name to re-send it with).
 *
 * It never says how they're doing. The card underneath says that, and a channel
 * scrolling past shouldn't be told someone lost before they've closed the tab.
 */
export function progressLine(live: boolean, puzzleNumber: number): string {
  const what = puzzleNumber > 0 ? `**${TITLE}** · No. ${puzzleNumber}` : `**${TITLE}**`;
  return `${live ? "is" : "was"} playing ${what}`;
}

/**
 * Fold a finished round into the card.
 *
 * `won` is passed rather than derived from the last guess because a round can
 * end without a winning guess — running out is a result too, and it prints
 * "X/6" the same way the shared text does.
 */
export function buildScorecard(
  puzzleNumber: number,
  guesses: GuessFeedback[],
  won: boolean,
  ingredientCount: number,
  maxGuesses: number = MAX_GUESSES,
): Scorecard {
  const score = won ? `${guesses.length}/${maxGuesses}` : `X/${maxGuesses}`;
  // An unnumbered round (Chef's Choice) would otherwise headline "No. 0" — the
  // same conditional presence.ts needs, for the same reason.
  const subtitle = puzzleNumber > 0 ? `No. ${puzzleNumber} · ${score}` : score;
  return {
    title: TITLE,
    subtitle,
    rows: guesses.map((g) => {
      const a = g.attributes;
      return {
        tiles: [a.country.match, a.course.match, a.temperature.match, a.protein.match],
        pantry: g.correct ? "" : `${g.matchedIngredients.length}/${ingredientCount}`,
        correct: g.correct,
      };
    }),
    footer: SCORECARD_FOOTER,
  };
}
