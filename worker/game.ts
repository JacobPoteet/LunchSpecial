// Pure game logic: guess feedback and daily-dish selection. No I/O — unit tested.

import type { AttributeFeedback, Course, GuessFeedback, Protein, Region, Temperature } from "../shared/types";
import { EPOCH_DATE } from "../shared/types";

export interface DishRecord {
  id: number;
  name: string;
  country: string;
  region: Region;
  course: Course;
  temperature: Temperature;
  protein: Protein;
  ingredients: string[];
}

export function compareAttributes(guess: DishRecord, target: DishRecord): AttributeFeedback {
  return {
    country: {
      value: guess.country,
      match:
        guess.country === target.country ? "hit" : guess.region === target.region ? "near" : "miss",
    },
    course: { value: guess.course, match: guess.course === target.course ? "hit" : "miss" },
    temperature: {
      value: guess.temperature,
      match: guess.temperature === target.temperature ? "hit" : "miss",
    },
    protein: { value: guess.protein, match: guess.protein === target.protein ? "hit" : "miss" },
  };
}

export function computeFeedback(guess: DishRecord, target: DishRecord): Omit<GuessFeedback, "clue"> {
  const targetSet = new Set(target.ingredients);
  const matchedIngredients = guess.ingredients.filter((i) => targetSet.has(i));
  const unmatchedIngredients = guess.ingredients.filter((i) => !targetSet.has(i));
  return {
    correct: guess.id === target.id,
    dish: { id: guess.id, name: guess.name },
    matchedIngredients,
    unmatchedIngredients,
    attributes: compareAttributes(guess, target),
  };
}

/** Days since EPOCH_DATE, 1-based. Both arguments are YYYY-MM-DD strings. */
export function puzzleNumber(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${EPOCH_DATE}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function isValidDateString(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  // Reject dates like 2026-02-31 that Date.parse would roll over.
  return new Date(t).toISOString().slice(0, 10) === date;
}

/** The player sends their local date; accept it if within a day of UTC now. */
export function isAllowedRequestDate(date: string, now: Date = new Date()): boolean {
  if (!isValidDateString(date)) return false;
  const diff = Math.abs(Date.parse(`${date}T00:00:00Z`) - now.getTime());
  return diff <= 2 * 86_400_000;
}

/**
 * A past (or current) puzzle date, playable from the archive: from puzzle #1
 * (EPOCH_DATE) up to today (UTC). Future dates are rejected so upcoming
 * Specials aren't spoiled.
 */
export function isArchiveDate(date: string, now: Date = new Date()): boolean {
  if (!isValidDateString(date)) return false;
  return date >= EPOCH_DATE && date <= now.toISOString().slice(0, 10);
}

/**
 * Any date the server will serve a Special for: today (with the daily's
 * timezone tolerance) or any earlier puzzle from the archive.
 */
export function isPlayableDate(date: string, now: Date = new Date()): boolean {
  return isAllowedRequestDate(date, now) || isArchiveDate(date, now);
}

/**
 * Deterministic fallback pick for dates with no scheduled dish, so the game
 * never breaks. FNV-1a over the date string, mod the pool size.
 */
export function fallbackDishIndex(date: string, poolSize: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) {
    hash ^= date.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % poolSize;
}
