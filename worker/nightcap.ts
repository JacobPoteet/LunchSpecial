// Pure After Dark logic: guess feedback and the night's fallback pick. No I/O.
//
// The bar's answer to worker/game.ts. Two of the four tiles differ (spirit and
// profile stand in for course and protein), and the ingredient intersection is
// identical, which is the part that makes a drink round feel like the same game
// played faster rather than a different game entirely.

import type { DrinkAttributeFeedback, DrinkGuessFeedback, Profile, Region, Spirit, Temperature } from "../shared/types";

export interface DrinkRecord {
  id: number;
  name: string;
  country: string;
  region: Region;
  spirit: Spirit;
  temperature: Temperature;
  profile: Profile;
  ingredients: string[];
}

/**
 * Country is the only three-state tile, exactly as on a dish: same country is a
 * hit, same region a near, anything else a miss. The other three are binary,
 * and `spirit` deliberately so — 'none' is a value like any other, so a mocktail
 * matching a mocktail is a hit rather than a special case.
 */
export function compareDrinkAttributes(guess: DrinkRecord, target: DrinkRecord): DrinkAttributeFeedback {
  return {
    country: {
      value: guess.country,
      match: guess.country === target.country ? "hit" : guess.region === target.region ? "near" : "miss",
    },
    spirit: { value: guess.spirit, match: guess.spirit === target.spirit ? "hit" : "miss" },
    temperature: {
      value: guess.temperature,
      match: guess.temperature === target.temperature ? "hit" : "miss",
    },
    profile: { value: guess.profile, match: guess.profile === target.profile ? "hit" : "miss" },
  };
}

export function computeDrinkFeedback(
  guess: DrinkRecord,
  target: DrinkRecord,
): Omit<DrinkGuessFeedback, "coaster"> {
  const targetSet = new Set(target.ingredients);
  return {
    correct: guess.id === target.id,
    drink: { id: guess.id, name: guess.name },
    matchedIngredients: guess.ingredients.filter((i) => targetSet.has(i)),
    unmatchedIngredients: guess.ingredients.filter((i) => !targetSet.has(i)),
    attributes: compareDrinkAttributes(guess, target),
  };
}
