// Shareable emoji summary of a finished round.

import type { GuessFeedback, MatchLevel } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";

const SQUARE: Record<MatchLevel, string> = { hit: "🟩", near: "🟨", miss: "⬜" };

export const SHARE_URL = "https://lunchspecial.app";

// The score card only — NO url. Callers pass the url as a separate Web Share
// field (and append it for the clipboard fallback). Keeping them apart lets
// each share target format the link itself.
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
    const pantry = g.correct ? "🛎️" : `${g.matchedIngredients.length}/${ingredientCount}🥄`;
    return `${tiles} ${pantry}`;
  });
  return [`Lunch Special #${puzzleNumber} — ${score}`, ...rows].join("\n");
}

/**
 * Copy text to the clipboard, with a legacy fallback.
 *
 * `navigator.clipboard` is gated behind the `clipboard-write` permissions
 * policy, which the Discord Activity iframe does not grant — the promise just
 * rejects there. The old `execCommand("copy")` path has no such gate (it only
 * needs the call to happen inside a user gesture), so it's what actually gets
 * the score card onto a Discord player's clipboard. Try the modern API first
 * and fall back rather than the other way round: `execCommand` is deprecated
 * and steals focus for a tick.
 */
export async function copyShareText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    // Keep it off-screen and unfocusable-looking, but still selectable.
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "-9999px";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
