// After Dark's shapes: the bar's constants, a drink, a Nightcap guess and
// its feedback, and the admin's After Dark tab. Deliberately parallel to the
// dish shapes rather than shared with them; see the comment on DrinkSummary.

import type { Temperature, Region, MatchLevel, RoundKind } from "./game";
import { MAX_GUESSES } from "./game";
import type { Rate } from "../sample";

// ---- After Dark ----
//
// The bar's half of the game: one drink a night, four guesses, three coasters,
// between 20:00 and 03:00 on the player's own clock. The clock itself is
// shared/night.ts; these are the numbers the rest of the codebase needs.

/**
 * Guesses on a Nightcap. Four, not six — a shorter round is most of what makes
 * the mode feel like a different game rather than lunch with the lights off.
 *
 * MAX_GUESSES stays the validators' ceiling, so nothing that accepts a guess
 * count needs to know which mode it came from. What must never happen is the
 * two being *pooled*: a "won in 4" out of six and a "won in 4" out of four are
 * different achievements, and any aggregate touching guesses splits on kind.
 */
export const DRINK_MAX_GUESSES = 4;

/**
 * The ceiling the round was actually played under — four at the bar, six at
 * lunch.
 *
 * One expression rather than a `kind === "nightcap" ?` written out wherever a
 * guess count is validated or printed. Every caller that shows a guess count
 * beside another kind's needs it, because a bare "solved in 4" means two
 * different things depending on which board it came off.
 */
export const maxGuessesFor = (kind: RoundKind): number =>
  kind === "nightcap" ? DRINK_MAX_GUESSES : MAX_GUESSES;

/** Coasters per drink, one per miss. Beats 1-3 of the drinks beat sheet. */
export const DRINK_CLUE_COUNT = 3;

/**
 * Autofill skips a drink poured within this many nights. The dish board uses 60.
 * The bar was set to 21 when it held 40 drinks, where a 60-night window would
 * have left autofill nothing to place inside a month. The pool is 100 now, so
 * the number is headroom rather than a forced choice; it stays until a night
 * board actually wants the wider gap.
 */
export const NIGHT_REPEAT_WINDOW_DAYS = 21;

/**
 * Night #1. Its own epoch: the bar opened long after the diner did, and
 * numbering the first Nightcap off the lunch count would claim nights that
 * never happened.
 *
 * It must be on or before the day After Dark ships. isPlayableNight refuses any
 * night earlier than this, so an epoch dated into the future closes the bar
 * completely — which is exactly what a launch-day date did in testing.
 */
export const NIGHT_EPOCH_DATE = "2026-09-04";

/**
 * A drink's base spirit, and the tile that replaces `course` (every drink is
 * the same course, so the tile said nothing).
 *
 * `none` carries alcoholic-vs-not for free on the board: a mocktail is spirit
 * `none`. It does NOT mean non-alcoholic — beer and wine are their own values —
 * which is why {@link Drink.isAlcoholic} is stored rather than derived.
 */
export const SPIRITS = [
  "gin",
  "whiskey",
  "rum",
  "tequila",
  "vodka",
  "brandy",
  "wine",
  "beer",
  "none",
  "other",
] as const;
export type Spirit = (typeof SPIRITS)[number];

/** How it drinks. Replaces `protein`, which no drink has. */
export const PROFILES = ["sweet", "sour", "bitter", "strong", "creamy"] as const;
export type Profile = (typeof PROFILES)[number];

// ---- After Dark: the drink shapes ----
//
// Deliberately parallel to the dish shapes rather than shared with them. Two of
// the four attributes differ, the clue count differs, and the guess pool is a
// different table — a union type here would push a discriminant check into
// every consumer to save four interfaces.

/** A drink by identity — what a guess refers to. */
export interface DrinkSummary {
  id: number;
  name: string;
}

/**
 * One drink as the guess pool lists it. Separate from {@link DrinkSummary}
 * because a pool row is a catalogue entry and a feedback `drink` is a
 * reference: putting the slug on both would have required every fold that
 * names a guessed drink to carry one it has no use for.
 *
 * The slug is public, exactly as a dish's is via /api/dishes. It is here so the
 * dev harness can roll a pour and pin it through the existing
 * `?nightcap=<slug>` path, rather than teaching the Worker a random branch that
 * must never exist in production — one drink a night with no archive is the
 * shape of the mode, and a random pour would quietly hand players a second one.
 */
export interface DrinkPoolEntry extends DrinkSummary {
  slug: string;
  /** Shown beside the name in the bar's order list, exactly as a dish's is. */
  country: string;
}

export interface Drink {
  id: number;
  name: string;
  slug: string;
  country: string;
  region: Region;
  spirit: Spirit;
  temperature: Temperature;
  profile: Profile;
  ingredients: string[];
  /** Stored, not derived from `spirit` — see the column comment in 0039. */
  isAlcoholic: boolean;
  isActive: boolean;
  isFanSubmission: boolean;
}

/** A drink's four tiles, the bar's answer to `AttributeFeedback` in game.ts. */
export interface DrinkAttributeFeedback {
  country: { value: string; region?: Region; match: MatchLevel };
  spirit: { value: Spirit; match: MatchLevel };
  temperature: { value: Temperature; match: MatchLevel };
  profile: { value: Profile; match: MatchLevel };
}

export interface DrinkGuessFeedback {
  correct: boolean;
  drink: DrinkSummary;
  matchedIngredients: string[];
  unmatchedIngredients: string[];
  attributes: DrinkAttributeFeedback;
  /** Revealed after an incorrect guess (guesses 1–3). */
  coaster?: { index: number; text: string };
}

/**
 * Tonight's Nightcap, as the board needs it before the first guess.
 *
 * `night` is the LOCAL night key the client asked for, echoed back so the round
 * and its localStorage slot agree on which night this is even if the player
 * crosses midnight mid-round.
 */
export interface NightcapInfo {
  night: string;
  nightNumber: number;
  maxGuesses: number;
  ingredientCount: number;
}

export interface NightcapReveal {
  id: number;
  name: string;
  country: string;
  region: Region;
  spirit: Spirit;
  temperature: Temperature;
  profile: Profile;
  isAlcoholic: boolean;
  ingredients: string[];
  coasters: string[];
  isFanSubmission: boolean;
}

// ---- After Dark: the admin's own tab ----
//
// Folded in worker/nightstats.ts. `Rate` carries its own Wilson interval and
// its denominator, so nothing here ever prints a percentage on its own.

export interface NightServiceDay {
  night: string;
  started: number;
  completed: number;
  solved: number;
  shared: number;
}

export interface NightTotals {
  started: number;
  completed: number;
  solved: number;
  shared: number;
  /** Solved over completed. Null when nothing has finished. */
  winRate: Rate | null;
  /** Completed over started. */
  finishRate: Rate | null;
  /** Shared over completed. */
  shareRate: Rate | null;
}

export interface NightDrinkRow {
  drinkId: number;
  name: string;
  country: string;
  spirit: string;
  /** Stored on the catalogue, never inferred from the spirit. */
  isAlcoholic: boolean;
  started: number;
  completed: number;
  solved: number;
  shared: number;
  winRate: Rate | null;
  /** Mean guesses on the rounds that were solved. Null if none were. */
  avgGuesses: number | null;
}

/** Win rate split by whether the pour had alcohol in it. */
export interface AlcoholSplit {
  boozy: { completed: number; solved: number; winRate: Rate | null };
  sober: { completed: number; solved: number; winRate: Rate | null };
}

export interface NightReport {
  /** Oldest first, one entry per night that recorded anything. */
  days: NightServiceDay[];
  totals: NightTotals;
  /** dist[i] = rounds solved in i+1 guesses. Always DRINK_MAX_GUESSES wide. */
  guessDistribution: number[];
  /**
   * Rounds per LOCAL hour of day, 24 buckets. Only rounds carrying a
   * `tz_offset` are placed; the rest are counted in `untrackedHour`, which the
   * panel prints rather than folding into a bucket.
   */
  hours: number[];
  untrackedHour: number;
  /**
   * Rounds whose local hour sits outside 20:00-03:00. The door cannot open
   * then, so these are clock skew rather than late drinkers, and they are
   * placed on the chart AND counted here rather than being hidden.
   */
  outsideHours: number;
  alcohol: AlcoholSplit;
  drinks: NightDrinkRow[];
  /** Rounds whose drink could not be resolved. Never assigned to a drink. */
  untrackedDrink: number;
}

export interface CrossoverDay {
  day: string;
  /**
   * Whether the night is over everywhere. An unsettled night is still being
   * played, so it carries no rate and is held out of the pooled headline.
   */
  settled: boolean;
  /** Devices that finished that day's Special. The denominator. */
  finishedLunch: number;
  /** Of those, how many started that night's Nightcap. */
  cameToBar: number;
  /** Devices at the bar with no finished Special on the same key. */
  barOnly: number;
  rate: Rate | null;
}

/** Nights still in progress, held out of the headline rather than dragging it. */
export interface CrossoverPending {
  nights: number;
  finishedLunch: number;
  cameToBar: number;
}

export interface Crossover {
  /** Every night the bar has existed, oldest first. */
  days: CrossoverDay[];
  /** Settled nights only — see foldCrossover for what that excludes and why. */
  finishedLunch: number;
  cameToBar: number;
  barOnly: number;
  rate: Rate | null;
  pending: CrossoverPending | null;
}

/** Tonight's pour and tomorrow's, for the top of the After Dark tab. */
export interface NightBoardTop {
  tonight: NightEntry;
  tomorrow: NightEntry;
  /** Active drinks that have never held a night, past or future. */
  neverPoured: number;
  /** Nights booked from tonight forward. */
  bookedAhead: number;
}

/** Everything the After Dark tab reads, in one response. */
export interface AfterDarkReport {
  board: NightBoardTop;
  report: NightReport;
  crossover: Crossover;
}

/** One night of the bar's board. A null drink runs on the fallback pick. */
export interface NightEntry {
  night: string;
  drinkId: number | null;
  drinkName: string | null;
}
