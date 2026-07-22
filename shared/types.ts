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

/** What a player submits when suggesting a dish for the menu. */
export interface DishRequestInput {
  /** The requested dish name (required). */
  name: string;
  /** Optional country of origin, free text. */
  country?: string;
  /** Optional free-text note from the player. */
  note?: string;
  /** Where it was submitted from (web / Discord), like analytics beacons. */
  surface: Surface;
  /** Optional anonymous per-device id (same value as the analytics player_id). */
  playerId?: string;
}

/** A player's dish suggestion, as shown in the admin review inbox. */
export interface DishRequest {
  id: number;
  name: string;
  country: string | null;
  note: string | null;
  surface: Surface;
  createdAt: string;
}

/** Field length caps for a dish request, shared by the client form + server. */
export const DISH_REQUEST_LIMITS = { name: 80, country: 60, note: 280 } as const;

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
  /** Distinct players whose first-ever play landed on this ET day. */
  newPlayers: number;
  /** Distinct players active this ET day who had first played on an earlier day. */
  returningPlayers: number;
}

/**
 * New vs returning player counts. A "player" is an anonymous device (a random id
 * kept in localStorage). For a day slice: `new` = devices whose first-ever play
 * was that day, `returning` = devices active that day that first played earlier.
 * For the all-time slice: `new` = total distinct players ever, `returning` = those
 * who have come back on at least one later day.
 */
export interface PlayerSplit {
  new: number;
  returning: number;
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
   * Today's Special (daily) / Leftovers (leftover) / Chef's Choice (random).
   * The three sum to `totals.started`.
   */
  startedByKind: StartedByKind;
  /** dist[i] = rounds solved in i+1 guesses. */
  guessDistribution: number[];
  /** Completed rounds that ran out of guesses. */
  fails: number;
  /** New vs returning player counts for this slice (see PlayerSplit). */
  players: PlayerSplit;
}

/** The three things a round can report, in the order they happen. */
export const ANALYTICS_EVENT_TYPES = ["start", "complete", "share"] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/**
 * One entry in the admin's recent-activity feed — a single beacon a round fired,
 * derived from the analytics_rounds row (see migrations/0011). Still anonymous:
 * no guess content, and `playerId` is a random per-device id, not an account.
 */
export interface AnalyticsEvent {
  type: AnalyticsEventType;
  /** When it happened, as an ISO-8601 UTC instant ("2026-07-20T14:32:07Z"). */
  at: string;
  /** The round this belongs to — a start/complete/share trio shares one id. */
  roundId: string;
  puzzleNumber: number;
  /** The puzzle's date (YYYY-MM-DD) — not necessarily the day it was played. */
  date: string;
  kind: RoundKind;
  surface: Surface;
  /** Anonymous per-device id, or null for rounds from clients that omit it. */
  playerId: string | null;
  /** Scheduled dish for `date`; null for random rounds (they ignore the schedule). */
  dishName: string | null;
  /** Guesses used — `complete` events only. */
  guesses: number | null;
  /** Whether the round was won — `complete` events only. */
  solved: boolean | null;
}

/** How many events the admin feed asks for at a time, and its server-side cap. */
export const ANALYTICS_EVENTS_PAGE = 50;
export const ANALYTICS_EVENTS_MAX = 200;

/** Anonymous engagement aggregates for the admin dashboard. No guess content. */
export interface AnalyticsSummary extends AnalyticsPeriod {
  /**
   * One ET day's slice — today unless `?date=` asked for an earlier one.
   * `totals`/`guessDistribution`/`fails` cover that day's Special only
   * (play_date = the day AND kind = daily) — that's the puzzle's difficulty, so
   * replays/random never dilute it. `startedByKind` instead counts every game
   * *started* that ET day split by kind, so the dashboard can headline "Today's
   * Special started" alongside leftovers + chef's specials.
   */
  day: AnalyticsPeriod & { date: string; dishName: string | null };
  /** The server's current ET day. `day.date` equals it unless a past day was asked for. */
  today: string;
  /**
   * Every ET day that recorded any activity, oldest first — the set the admin's
   * day picker offers. Surface-filtered like everything else, so switching to
   * Discord narrows it to days Discord players actually showed up.
   */
  activeDates: string[];
  /** Last 30 days with activity, oldest first. */
  daily: AnalyticsDay[];
  /** Games started per hour of day (ET, the daily-rollover zone), index 0..23. */
  hourly: number[];
}
