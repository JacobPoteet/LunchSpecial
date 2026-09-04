// Where a finished round goes when the player taps Share — PURE.
//
// The button has three destinations (the Discord channel, the native share
// sheet, the clipboard) and only one of them is settled before the click. This
// module holds the two decisions that don't need a browser to make: what the
// message says, and whether the native sheet is the right target. The plumbing
// that reads `navigator` lives in src/game/share.ts, and the Discord half in
// src/discord/share.ts.

import type { DrinkGuessFeedback, GuessFeedback, MatchLevel } from "./types";
import { DRINK_MAX_GUESSES, MAX_GUESSES } from "./types";

export const SHARE_URL = "https://lunchspecial.app";

/**
 * The one string every non-Discord share target receives.
 *
 * The url is folded into the text rather than travelling as Web Share's
 * separate `url` field. Windows' share sheet (Chrome and Edge on desktop) hands
 * each target whichever field that target understands, and most of them take
 * the url and drop the text — so a payload split across both fields arrives as
 * a bare link with the whole score card missing. One field can't be
 * half-delivered.
 */
export function shareMessage(text: string): string {
  return `${text}\n${SHARE_URL}`;
}

/**
 * Stack the grids a player is sharing into one message.
 *
 * A tab shared from After Dark carries the night's grid AND the lunch grid
 * above it, because the door to the bar is finishing lunch: by the time anyone
 * can press this, both rounds exist and both are theirs.
 *
 * One blank line between them and nothing else. A separator rule or a header
 * would be two more things that have to survive being pasted into a chat box
 * that reflows, and the grids already separate themselves — each leads with its
 * own title line. Blank blocks are dropped rather than printed as a gap, so the
 * same call works for a lone grid.
 */
export function joinShareBlocks(blocks: (string | null | undefined)[]): string {
  return blocks.filter((b): b is string => !!b && b.trim().length > 0).join("\n\n");
}

/** What the browser will tell us about itself, read once at click time. */
export type ShareCapabilities = {
  /** `navigator.share` exists. */
  hasShare: boolean;
  /** The primary pointer is coarse — `matchMedia("(pointer: coarse)")`. */
  coarsePointer: boolean;
  /**
   * What `navigator.canShare({ text })` said, or null where that API is absent
   * (it shipped after `share` itself, so its absence is not a refusal).
   */
  canShareText: boolean | null;
};

/**
 * Is the native share sheet the *better* target here?
 *
 * `navigator.share` existing is not the question, and treating it as the
 * question is what broke desktop: Chrome and Edge on Windows both have it, and
 * what it opens is an OS dialog offering to mail the result to somebody, which
 * is not what anyone means by sharing a Wordle grid. The clipboard is the
 * desktop answer — paste it wherever you were already going to paste it. The
 * sheet is the phone answer, where there's no comfortable paste target and
 * every messaging app is one tap away.
 *
 * A coarse *primary* pointer is the closest thing to "this is a phone" the
 * platform will say. Deliberately primary rather than `any-pointer`, which is
 * also true of a Windows touchscreen laptop — a mouse-driven desktop that
 * happens to have a screen you can poke, and exactly the case being fixed.
 *
 * The heuristic is allowed to be wrong in both directions because neither way
 * loses the grid: a mis-read desktop opens a sheet that now carries the whole
 * message in one field, and a mis-read tablet copies. That's the property to
 * preserve if this is ever retuned.
 */
export function wantsNativeShare(caps: ShareCapabilities): boolean {
  if (!caps.hasShare) return false;
  if (!caps.coarsePointer) return false;
  return caps.canShareText !== false;
}

const SQUARE: Record<MatchLevel, string> = { hit: "🟩", near: "🟨", miss: "⬜" };

/**
 * "2/7", or nothing at all when the denominator was never measured.
 *
 * A round saved before `RoundState.ingredientCount` shipped has no count, and
 * the After Dark tab redraws today's lunch grid from exactly those rounds. It
 * used to print "2/0", which is a grid claiming two of nothing — worse than a
 * row of tiles on its own, which is at least true.
 */
function pantryCount(matched: number, of: number, glyph: string): string {
  return of > 0 ? `${matched}/${of}${glyph}` : "";
}

/** A row is its tiles, plus the pantry column when there is one. */
function withPantry(tiles: string, pantry: string): string {
  return pantry ? `${tiles} ${pantry}` : tiles;
}

/**
 * The lunch grid. NO url: `shareMessage()` appends that once, to the whole
 * message, for every target that takes text. Keeping the fold itself url-free
 * is what lets shared/scorecard.ts draw the same score as a picture without one.
 */
export function buildShareText(
  puzzleNumber: number,
  guesses: GuessFeedback[],
  won: boolean,
  ingredientCount: number,
): string {
  const score = won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const rows = guesses.map((g) => {
    const a = g.attributes;
    const tiles = [a.country.match, a.course.match, a.temperature.match, a.protein.match]
      .map((m) => SQUARE[m])
      .join("");
    return withPantry(tiles, g.correct ? "🛎️" : pantryCount(g.matchedIngredients.length, ingredientCount, "🥄"));
  });
  return [`Lunch Special #${puzzleNumber} — ${score}`, ...rows].join("\n");
}

/**
 * The bar's squares. Same three states, same order, one swap: the miss is black
 * instead of white.
 *
 * That single change is what makes a Nightcap grid readable as a Nightcap at a
 * glance in a channel where both are being pasted, and it does it without a
 * second legend to learn — green is still a match, yellow is still close. It
 * also happens to be the only one of the three that reads as "lights out",
 * which is the point.
 */
const NIGHT_SQUARE: Record<MatchLevel, string> = { hit: "🟩", near: "🟨", miss: "⬛" };

/**
 * The Nightcap's grid. No url, exactly like buildShareText: joinShareBlocks
 * stacks the blocks and shareMessage appends the url once, to the whole thing.
 */
export function buildNightShareText(
  nightNumber: number,
  guesses: DrinkGuessFeedback[],
  won: boolean,
  ingredientCount: number,
): string {
  const score = won ? `${guesses.length}/${DRINK_MAX_GUESSES}` : `X/${DRINK_MAX_GUESSES}`;
  const rows = guesses.map((g) => {
    const a = g.attributes;
    const tiles = [a.country.match, a.spirit.match, a.temperature.match, a.profile.match]
      .map((m) => NIGHT_SQUARE[m])
      .join("");
    // 🥂 for the drink you landed on, 🥃 for the pantry count — the bar's
    // answer to the bell and the spoon.
    return withPantry(tiles, g.correct ? "🥂" : pantryCount(g.matchedIngredients.length, ingredientCount, "🥃"));
  });
  const title = nightNumber > 0 ? `After Dark · Night #${nightNumber} — ${score}` : `After Dark — ${score}`;
  return [title, ...rows].join("\n");
}
