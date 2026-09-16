// The back office's catalogue shapes: dish and drink rows, the editors'
// inputs, the schedule, and the suggestion inbox.

import type { Course, Temperature, Protein, Region, Surface, Dish } from "./game";
import type { Spirit, Profile, Drink } from "./night";

// ---- Admin API shapes ----

export interface AdminDishRow extends Dish {
  clueCount: number;
  /** Most recent schedule row on or before today, or null if never served. */
  lastServed: string | null;
  /**
   * Earliest schedule row *after* today, or null if nothing is booked. A dish is
   * only genuinely unspoken-for when this and `lastServed` are both null — the
   * same "never scheduled, past or future" rule the shuffle picks by, and what
   * lets the Dishes list hide anything already committed.
   */
  nextBooked: string | null;
  /** Schedule rows on or before today — how many times this has been the Special. */
  timesServed: number;
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
  isFanSubmission: boolean;
  clues: string[];
}

export interface ScheduleEntry {
  date: string;
  dishId: number | null;
  dishName: string | null;
}

// ---- Admin: the back bar ----

export interface AdminDrinkRow extends Drink {
  coasterCount: number;
  /** Most recent night on or before tonight, or null if never poured. */
  lastPoured: string | null;
  /** Earliest night after tonight, or null if nothing is booked. */
  nextBooked: string | null;
  timesPoured: number;
  /** Meets booking requirements: >= 3 ingredients and exactly 3 coasters. */
  pourable: boolean;
}

export interface AdminDrinkDetail extends Drink {
  coasters: string[];
}

export interface AdminDrinkInput {
  name: string;
  country: string;
  region: Region;
  spirit: Spirit;
  temperature: Temperature;
  profile: Profile;
  ingredients: string[];
  isAlcoholic: boolean;
  isActive: boolean;
  isFanSubmission: boolean;
  coasters: string[];
}

/** What a player submits when suggesting a dish for the menu. */
/**
 * Which catalogue a suggestion is for. A dish is asked for on the check, a
 * drink on the tab; both land in one inbox and the admin splits them on this.
 */
export const REQUEST_KINDS = ["dish", "drink"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export interface DishRequestInput {
  /** The requested dish or drink name (required). */
  name: string;
  /** Dish or drink. Absent means dish, which is what every request was before the bar took them. */
  kind?: RequestKind;
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
  kind: RequestKind;
  name: string;
  country: string | null;
  note: string | null;
  surface: Surface;
  createdAt: string;
}

/** Field length caps for a dish request, shared by the client form + server. */
export const DISH_REQUEST_LIMITS = { name: 80, country: 60, note: 280 } as const;
