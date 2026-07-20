// Types shared between the Worker API and the React client.

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

export type MatchLevel = "hit" | "near" | "miss";

/**
 * The kind of round, for analytics: the daily Special, a "leftover" (an archive
 * replay of a past puzzle), or a "chef's special" (a random recipe). Preview
 * (admin test play) is never tracked, so it isn't a kind here.
 */
export const ROUND_KINDS = ["daily", "leftover", "random"] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

/** Games started, split by round kind. The three always sum to `started`. */
export type StartedByKind = Record<RoundKind, number>;

export const MAX_GUESSES = 6;
/** Date of puzzle #1. */
export const EPOCH_DATE = "2026-07-17";

export interface DishSummary {
  id: number;
  name: string;
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
}

export interface AttributeFeedback {
  /** Guessed dish's value + how it compares to the Special. near = same region, different country. */
  country: { value: string; match: MatchLevel };
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
}

// ---- Admin API shapes ----

export interface AdminDishRow extends Dish {
  clueCount: number;
  lastServed: string | null;
  /** Meets scheduling requirements: >= 3 ingredients and exactly 5 clues. */
  schedulable: boolean;
}

export interface AdminDishDetail extends Dish {
  clues: string[];
}

export interface AdminDishInput {
  name: string;
  country: string;
  region: Region;
  course: Course;
  temperature: Temperature;
  protein: Protein;
  ingredients: string[];
  isActive: boolean;
  clues: string[];
}

export interface ScheduleEntry {
  date: string;
  dishId: number | null;
  dishName: string | null;
}

export interface AdminDashboard {
  today: { date: string; dishId: number | null; dishName: string | null };
  scheduledAhead: number;
  firstGap: string | null;
  warnings: { kind: "missing-clues" | "few-ingredients"; dishId: number; dishName: string; detail: string }[];
}

export interface AnalyticsDay {
  /** ET calendar day the rounds were started on (YYYY-MM-DD). */
  date: string;
  started: number;
  /** `started` split by kind (daily + leftover + random === started). */
  startedByKind: StartedByKind;
  completed: number;
  solved: number;
  shared: number;
}

/** Public engagement totals for the README badges. Aggregate-only, no guess content. */
export interface PublicStats {
  /** Rounds started. */
  rounds: number;
  /** Rounds that reached game over (win or loss). */
  completed: number;
  /** Rounds solved. */
  solved: number;
  /** Rounds whose result was shared. */
  shared: number;
}

/** Totals + guess distribution for one slice of rounds (today, or all time). */
export interface AnalyticsPeriod {
  totals: { started: number; completed: number; solved: number; shared: number };
  /**
   * Games started split by kind. `started` counts all kinds; this breaks it into
   * Today's Special (daily) / Leftovers (leftover) / Chef's Special (random).
   * The three sum to `totals.started`.
   */
  startedByKind: StartedByKind;
  /** dist[i] = rounds solved in i+1 guesses. */
  guessDistribution: number[];
  /** Completed rounds that ran out of guesses. */
  fails: number;
}

/** Anonymous engagement aggregates for the admin dashboard. No guess content. */
export interface AnalyticsSummary extends AnalyticsPeriod {
  /**
   * Today's slice. `totals`/`guessDistribution`/`fails` cover today's Special
   * only (play_date = server today AND kind = daily) — that's the puzzle's
   * difficulty, so replays/random never dilute it. `startedByKind` instead
   * counts every game *started today* (ET) split by kind, so the dashboard can
   * headline "Today's Special started" alongside leftovers + chef's specials.
   */
  today: AnalyticsPeriod & { date: string; dishName: string | null };
  /** Last 30 days with activity, oldest first. */
  daily: AnalyticsDay[];
  /** Games started per hour of day (ET, the daily-rollover zone), index 0..23. */
  hourly: number[];
}
