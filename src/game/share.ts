// Shareable emoji summary of a finished round.

import type { GuessFeedback, MatchLevel } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";

const SQUARE: Record<MatchLevel, string> = { hit: "🟩", near: "🟨", miss: "⬜" };

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
  return [`Lunch Special #${puzzleNumber} — ${score}`, ...rows, "https://lunchspecial.game"].join("\n");
}
