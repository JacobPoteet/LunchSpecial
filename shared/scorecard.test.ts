import { describe, expect, it } from "vitest";
import { buildNightScorecard, buildScorecard, progressLine, SCORECARD_FOOTER } from "./scorecard";
import type { DrinkGuessFeedback, GuessFeedback, MatchLevel } from "./types";
import { DRINK_MAX_GUESSES, MAX_GUESSES } from "./types";

/**
 * A guess whose four attributes landed as given. The dish carries a deliberately
 * loud name so the leak test below has something unmistakable to look for.
 */
function guess(
  tiles: [MatchLevel, MatchLevel, MatchLevel, MatchLevel],
  matched: number,
  correct = false,
): GuessFeedback {
  const [country, course, temperature, protein] = tiles;
  return {
    correct,
    dish: { id: 1, name: "Bibimbap", slug: "bibimbap", country: "South Korea" } as GuessFeedback["dish"],
    matchedIngredients: Array.from({ length: matched }, (_, i) => `ingredient-${i}`),
    unmatchedIngredients: [],
    attributes: {
      country: { match: country },
      course: { match: course },
      temperature: { match: temperature },
      protein: { match: protein },
    } as GuessFeedback["attributes"],
  };
}

const miss = guess(["miss", "near", "hit", "miss"], 2);
const win = guess(["hit", "hit", "hit", "hit"], 7, true);

describe("buildScorecard", () => {
  it("heads the card with the puzzle and the score", () => {
    expect(buildScorecard(26, [miss, win], true, 7).subtitle).toBe("No. 26 · 2/6");
    expect(buildScorecard(26, [miss, miss, miss, miss, miss, miss], false, 7).subtitle).toBe("No. 26 · X/6");
  });

  // A Chef's Choice is outside the numbering; "No. 0" would be a lie.
  it("drops the number when the round hasn't got one", () => {
    expect(buildScorecard(0, [win], true, 7).subtitle).toBe("1/6");
  });

  it("lays out the four attribute tiles in board order", () => {
    expect(buildScorecard(26, [miss], false, 7).rows[0].tiles).toEqual(["miss", "near", "hit", "miss"]);
  });

  it("counts the pantry, except on the guess that ended it", () => {
    const { rows } = buildScorecard(26, [miss, win], true, 7);
    expect(rows[0]).toMatchObject({ pantry: "2/7", correct: false });
    expect(rows[1]).toMatchObject({ pantry: "", correct: true });
  });

  it("keeps one row per guess, in the order they were played", () => {
    expect(buildScorecard(26, [miss, miss, win], true, 7).rows).toHaveLength(3);
  });

  it("always says where the card came from", () => {
    expect(buildScorecard(26, [win], true, 7).footer).toBe(SCORECARD_FOOTER);
  });

  // The rule this module exists under: a card lands in a channel full of people
  // who haven't played yet. `guess()` above names a real dish in every row, so
  // if any of it could reach the card, this would catch it.
  it("says nothing about the dish, in any state", () => {
    for (const won of [true, false]) {
      for (let n = 1; n <= MAX_GUESSES; n++) {
        const guesses = Array.from({ length: n }, () => miss);
        const card = buildScorecard(26, guesses, won, 7);
        const text = [card.title, card.subtitle, card.footer, ...card.rows.map((r) => r.pantry)].join(" ");
        expect(text).not.toMatch(/bibimbap|korea/i);
        // Nothing but counts and the two fixed labels is interpolated, so the
        // guard that matters is that no free text reaches the card at all.
        expect(text).toMatch(/^[A-Za-z0-9'·./\s]+$/);
      }
    }
  });
});

describe("progressLine", () => {
  it("changes tense when the round ends", () => {
    expect(progressLine(true, 26)).toBe("is playing **Lunch Special** · No. 26");
    expect(progressLine(false, 26)).toBe("was playing **Lunch Special** · No. 26");
  });

  it("names the room and counts in its own unit", () => {
    expect(progressLine(true, 12, "night")).toBe("is playing **After Dark** · Night 12");
    expect(progressLine(false, 12, "night")).toBe("was playing **After Dark** · Night 12");
  });

  it("drops the number when the round hasn't got one", () => {
    expect(progressLine(true, 0)).toBe("is playing **Lunch Special**");
  });

  // The channel sees this line the whole time the round is live, including
  // while the player still has guesses left.
  it("never says how it's going", () => {
    for (const live of [true, false]) {
      expect(progressLine(live, 26)).not.toMatch(/solved|lost|won|guess|\d\/\d/i);
    }
  });
});

/**
 * A drink guess whose four tiles landed as given. Loud name and country for the
 * same reason the dish helper has one: the leak test needs something
 * unmistakable to look for.
 */
function pour(
  tiles: [MatchLevel, MatchLevel, MatchLevel, MatchLevel],
  matched: number,
  correct = false,
): DrinkGuessFeedback {
  const [country, spirit, temperature, profile] = tiles;
  return {
    correct,
    drink: { id: 1, name: "Caipirinha" },
    matchedIngredients: Array.from({ length: matched }, (_, i) => `ingredient-${i}`),
    unmatchedIngredients: [],
    attributes: {
      country: { value: "Brazil", match: country },
      spirit: { value: "other", match: spirit },
      temperature: { value: "cold", match: temperature },
      profile: { value: "sour", match: profile },
    },
  };
}

const pourMiss = pour(["miss", "near", "hit", "miss"], 1);

describe("buildNightScorecard", () => {
  it("marks the card as drawn in the bar", () => {
    // The drawing picks its palette off this and nothing else, so a card that
    // forgot to say where it came from would be painted on diner paper.
    expect(buildNightScorecard(12, [pourMiss], false, 5).theme).toBe("night");
    expect(buildScorecard(26, [miss], false, 7).theme).toBe("day");
  });

  it("counts in nights and out of four", () => {
    expect(buildNightScorecard(12, [pourMiss, pourMiss], false, 5).subtitle).toBe("Night 12 · X/4");
    expect(buildNightScorecard(12, [pourMiss], true, 5).subtitle).toBe("Night 12 · 1/4");
  });

  it("drops the number when the round hasn't got one", () => {
    expect(buildNightScorecard(0, [pourMiss], false, 5).subtitle).toBe("X/4");
  });

  it("lays out the four tiles in board order", () => {
    // Country, spirit, served, profile — the order the bar's rows draw them.
    expect(buildNightScorecard(12, [pourMiss], false, 5).rows[0].tiles).toEqual([
      "miss",
      "near",
      "hit",
      "miss",
    ]);
  });

  it("says nothing about the drink, in any state", () => {
    // The same rule and the same guard as the dish card. `pour()` names a real
    // drink and a real country in every row.
    for (const won of [true, false]) {
      for (let n = 1; n <= DRINK_MAX_GUESSES; n++) {
        const card = buildNightScorecard(12, Array.from({ length: n }, () => pourMiss), won, 5);
        const text = [card.title, card.subtitle, card.footer, ...card.rows.map((r) => r.pantry)].join(" ");
        expect(text).not.toMatch(/caipirinha|brazil|cachaca/i);
        expect(text).toMatch(/^[A-Za-z0-9'·./\s]+$/);
      }
    }
  });
});
