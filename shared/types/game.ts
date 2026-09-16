// The diner's shapes: the four attribute enums, a dish, a guess and its
// feedback, the daily info and the reveal. What the Worker and the React
// client agree on for one round of lunch.

export const COURSES = ["breakfast", "appetizer", "entree", "dessert", "drink"] as const;
export type Course = (typeof COURSES)[number];

export const TEMPERATURES = ["hot", "cold"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const PROTEINS = ["beef", "pork", "poultry", "seafood", "lamb", "vegetarian"] as const;
export type Protein = (typeof PROTEINS)[number];

export const REGIONS = [
  "north-america",
  "latin-america",
  "europe",
  "middle-east",
  "africa",
  "south-asia",
  "east-asia",
  "southeast-asia",
  "oceania",
] as const;
export type Region = (typeof REGIONS)[number];

/**
 * The region as the board says it. The slugs are the game's own buckets, and
 * the buckets are not the atlas's (Mexico is Latin America here, Turkey is the
 * Middle East), which is why a near tile names its bucket rather than leaving
 * the player to guess which one the game put their guess in (GitHub #187).
 */
export const REGION_LABELS: Record<Region, string> = {
  "north-america": "North America",
  "latin-america": "Latin America",
  europe: "Europe",
  "middle-east": "Middle East",
  africa: "Africa",
  "south-asia": "South Asia",
  "east-asia": "East Asia",
  "southeast-asia": "Southeast Asia",
  oceania: "Oceania",
};

export type MatchLevel = "hit" | "near" | "miss";

/**
 * The kind of round, for analytics: the daily Special, a "leftover" (an archive
 * replay of a past puzzle), a "chef's special" (a random recipe), or a Nightcap
 * (After Dark). Preview and playtest are never tracked, so they aren't kinds.
 *
 * `nightcap` is not just another value. Two columns change meaning under it:
 * `play_date` holds a LOCAL night key rather than an ET day, and `guesses` is
 * out of four rather than six. Nothing may pool it with the other three on
 * either -- see the guess-distribution queries in worker/routes/admin.ts.
 */
export const ROUND_KINDS = ["daily", "leftover", "random", "nightcap"] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

/** Games started, split by round kind. The four always sum to `started`. */
export type StartedByKind = Record<RoundKind, number>;

/**
 * Where a round was played: the open web or the Discord Activity embed. Derived
 * client-side from Discord's `frame_id` iframe signal (see
 * src/discord/bootstrap.ts). The admin dashboard can slice engagement by surface.
 */
export const SURFACES = ["web", "discord"] as const;
export type Surface = (typeof SURFACES)[number];

export const MAX_GUESSES = 6;
/** Date of puzzle #1. */
export const EPOCH_DATE = "2026-07-17";

export interface DishSummary {
  id: number;
  name: string;
}

/**
 * One dish as the order bar lists it. The country rides along so the list can
 * show "Pho · Vietnam" to somebody who half-knows the dish; it is shown, never
 * searched (see GuessInput). A guessed dish's country is on the board the
 * moment it is ordered, so this exposes nothing the game doesn't already say.
 */
export interface DishPoolEntry extends DishSummary {
  country: string;
}

export interface Dish {
  id: number;
  name: string;
  slug: string;
  country: string;
  region: Region;
  course: Course;
  temperature: Temperature;
  protein: Protein;
  ingredients: string[];
  isActive: boolean;
  /**
   * Came from a player's "Suggest a dish" request rather than the kitchen's own
   * list. A credit only — it never affects scheduling, the fallback pick or
   * feedback. The check modal stamps it when the dish is the Special.
   */
  isFanSubmission: boolean;
}

export interface AttributeFeedback {
  /**
   * Guessed dish's value + how it compares to the Special. near = same region,
   * different country. `region` is the guess's bucket, which a near tile names
   * so the player learns which one the game means. Optional only because a
   * round saved before it shipped has rows without it.
   */
  country: { value: string; region?: Region; match: MatchLevel };
  course: { value: Course; match: MatchLevel };
  temperature: { value: Temperature; match: MatchLevel };
  protein: { value: Protein; match: MatchLevel };
}

export interface GuessFeedback {
  correct: boolean;
  dish: DishSummary;
  /** Guess ingredients also found in the Special. */
  matchedIngredients: string[];
  /** Guess ingredients not in the Special. */
  unmatchedIngredients: string[];
  attributes: AttributeFeedback;
  /** Revealed after an incorrect guess (guesses 1–5). */
  clue?: { index: number; text: string };
}

export interface DailyInfo {
  date: string;
  puzzleNumber: number;
  maxGuesses: number;
  /** How many ingredients the Special has — printed on the menu as a hint. */
  ingredientCount: number;
}

export interface RevealInfo {
  id: number;
  name: string;
  country: string;
  region: Region;
  course: Course;
  temperature: Temperature;
  protein: Protein;
  ingredients: string[];
  clues: string[];
  /** Credited on the check as a player suggestion — see {@link Dish.isFanSubmission}. */
  isFanSubmission: boolean;
}
