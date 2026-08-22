import { describe, expect, it } from "vitest";
import { clueAnnouncement, guessAnnouncement, MATCH_MARKS, MATCH_WORDS } from "./announce";
import { MAX_GUESSES, type GuessFeedback } from "./types";

const miss: GuessFeedback = {
  correct: false,
  dish: { id: 7, name: "Boeuf Bourguignon" },
  matchedIngredients: ["onion", "garlic"],
  unmatchedIngredients: ["beef", "red wine"],
  attributes: {
    country: { value: "France", match: "near" },
    course: { value: "entree", match: "hit" },
    temperature: { value: "hot", match: "hit" },
    protein: { value: "beef", match: "miss" },
  },
};

const say = (guess: GuessFeedback, guessNumber = 3, ingredientCount = 6) =>
  guessAnnouncement({ guess, ingredientCount, guessNumber, maxGuesses: MAX_GUESSES });

describe("guessAnnouncement", () => {
  it("reads a miss as position, ingredients, tiles, what's left", () => {
    expect(say(miss)).toBe(
      "Guess 3 of 6: Boeuf Bourguignon. 2 of 6 ingredients match. " +
        "country close, course match, served match, protein no match. 3 guesses left.",
    );
  });

  // The four tiles are all hits on a win, so reading them out would only delay
  // the one fact worth hearing.
  it("leads with the win and stops", () => {
    expect(say({ ...miss, correct: true }, 4)).toBe("Boeuf Bourguignon is the Special. Solved in 4 guesses.");
    expect(say({ ...miss, correct: true }, 1)).toBe("Boeuf Bourguignon is the Special. Solved in 1 guess.");
  });

  it("names the tiles in the order the board draws them", () => {
    const order = ["country", "course", "served", "protein"];
    const said = say(miss);
    const found = order.map((label) => said.indexOf(` ${label} `) >= 0 || said.indexOf(`. ${label} `) >= 0);
    expect(found.every(Boolean)).toBe(true);
    expect(said.indexOf("country")).toBeLessThan(said.indexOf("course"));
    expect(said.indexOf("course")).toBeLessThan(said.indexOf("served"));
    expect(said.indexOf("served")).toBeLessThan(said.indexOf("protein"));
  });

  it("counts down, and says so plainly on the last guess", () => {
    expect(say(miss, 5)).toContain("1 guess left.");
    expect(say(miss, MAX_GUESSES)).toContain("No guesses left.");
  });

  // The board never leaks the target, and neither may the thing that describes
  // the board out loud.
  it("never names anything but the dish that was guessed", () => {
    const said = say(miss);
    expect(said).toContain("Boeuf Bourguignon");
    // Attribute *values* are the guess's own, and they stay off the summary —
    // the verdict is the information, the value is already on screen.
    expect(said).not.toContain("France");
    expect(said).not.toContain("red wine");
  });
});

describe("clueAnnouncement", () => {
  it("numbers the ticket it is reading", () => {
    expect(clueAnnouncement(2, "It comes from a country shaped like a boot.")).toBe(
      "Clue 2: It comes from a country shaped like a boot.",
    );
  });
});

describe("the two redundant channels", () => {
  // A glyph without a word helps nobody using a screen reader; a word without a
  // glyph helps nobody who can't separate the green from the mustard. Both
  // tables have to cover all three states or one group loses the answer.
  it("covers every match level", () => {
    for (const level of ["hit", "near", "miss"] as const) {
      expect(MATCH_WORDS[level]).toBeTruthy();
      expect(MATCH_MARKS[level]).toBeTruthy();
    }
  });

  it("gives the three states three distinct marks", () => {
    expect(new Set(Object.values(MATCH_MARKS)).size).toBe(3);
    expect(new Set(Object.values(MATCH_WORDS)).size).toBe(3);
  });
});
