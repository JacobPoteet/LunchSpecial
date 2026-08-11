// Discord Rich Presence copy — PURE.
//
// When the game runs as a Discord Activity, the player's Discord profile can
// show two lines under "Playing Lunch Special": what they're playing (the game
// mode + puzzle number) and how they're doing (their progress through the six
// guesses). This module is the fold from round state to those two lines; the
// SDK plumbing that ships them lives in src/discord/presence.ts.
//
// One rule governs every string in here: **never name the dish.** A profile is
// read by people who haven't played today, and "Playing Lunch Special — Ramen"
// hands them the answer. That's the same reason the API never leaks the target
// except through /reveal. Progress is safe (a guess count says nothing about
// the dish); the answer, the guessed dishes and the clues are not.

import type { RoundKind } from "./types";
import { MAX_GUESSES } from "./types";

/** What the presence lines are built from. Everything the fold is allowed to know. */
export interface PresenceInput {
  /** Which mode: Today's Special, an archive Leftover, or a Chef's Choice. */
  kind: RoundKind;
  /** The puzzle's number, or 0 when the round isn't numbered (Chef's Choice). */
  puzzleNumber: number;
  status: "playing" | "won" | "lost";
  /** Guesses submitted so far (0 before the first order). */
  guesses: number;
  /**
   * Epoch ms this board opened, for Discord's elapsed timer. Optional because a
   * round restored from localStorage has no honest start time.
   */
  startedAt?: number;
  /** Overridable only so the tests don't have to track {@link MAX_GUESSES}. */
  maxGuesses?: number;
}

/**
 * The activity partial handed to `setActivity`. A deliberately small subset of
 * what Discord accepts: no assets (the Activity already shows the app's icon),
 * no party (this is a single-player game, and a party size would draw a "join"
 * badge on a game nobody can join).
 */
export interface PresenceActivity {
  /** Line one — what they're playing. */
  details: string;
  /** Line two — how they're doing. */
  state: string;
  /** Present only while a round is live, so a finished check doesn't tick. */
  timestamps?: { start: number };
}

/** Discord truncates `details`/`state` past this; ours are far shorter by construction. */
export const PRESENCE_TEXT_LIMIT = 128;

/** What each mode is called on a Discord profile — the game's own names for them. */
const MODE_LABEL: Record<RoundKind, string> = {
  daily: "Today's Special",
  leftover: "Leftovers",
  random: "Chef's Choice",
};

/**
 * Line one: the mode, plus the puzzle number when the round has one. A Chef's
 * Choice never does (it's a random dish, outside the numbering), and neither
 * does an unnumbered board, so the separator has to be conditional or half the
 * profiles read "Chef's Choice — No. 0".
 */
function detailsFor(kind: RoundKind, puzzleNumber: number): string {
  const label = MODE_LABEL[kind];
  return puzzleNumber > 0 ? `${label} · No. ${puzzleNumber}` : label;
}

/**
 * Line two: progress, in the units the player sees on the board.
 *
 * Mid-round it counts the guess they're *on* rather than the ones they've used,
 * because that's the number the board is asking them for — someone with two
 * guesses down is on their third. A round that hasn't been ordered from yet has
 * no count worth printing, so it says what they're actually doing instead.
 */
function stateFor(status: PresenceInput["status"], guesses: number, maxGuesses: number): string {
  if (status === "won") return `Solved it in ${guesses} ${guesses === 1 ? "guess" : "guesses"}`;
  if (status === "lost") return "Out of guesses";
  if (guesses <= 0) return "Reading the menu";
  return `Guess ${Math.min(guesses + 1, maxGuesses)} of ${maxGuesses}`;
}

/**
 * Fold a round into the two lines Discord shows on the player's profile.
 *
 * The elapsed timer rides along only while the round is live: once the check is
 * printed the round is over, and a counter still climbing next to "Solved it in
 * 4 guesses" would be measuring how long they left the tab open.
 */
export function buildPresence(input: PresenceInput): PresenceActivity {
  const maxGuesses = input.maxGuesses ?? MAX_GUESSES;
  const activity: PresenceActivity = {
    details: detailsFor(input.kind, input.puzzleNumber),
    state: stateFor(input.status, input.guesses, maxGuesses),
  };
  if (input.status === "playing" && input.startedAt !== undefined) {
    activity.timestamps = { start: input.startedAt };
  }
  return activity;
}
