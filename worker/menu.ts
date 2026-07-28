// Pure helpers for the admin dashboard's menu-mix panel: what the kitchen has
// actually been serving, by dish attribute. DB-free so it stays unit-testable —
// routes/admin.ts runs the two queries and hands the raw rows here.
//
// Unlike everything in routes/analytics.ts this reads the *catalogue*, not
// players: schedule rows joined to dishes. No beacons, no player ids.

import {
  COURSES,
  EPOCH_DATE,
  PROTEINS,
  REGIONS,
  TEMPERATURES,
  type Course,
  type MenuMix,
  type MenuMixSlice,
  type MenuServing,
  type Protein,
  type Region,
  type Temperature,
} from "../shared/types";
import { puzzleNumber } from "./game";

/** How many past Specials the cadence strip gets. Older ones are still counted. */
export const MENU_TIMELINE_MAX = 60;
/** Pantry chart length — the tail is a long flat run of one-offs. */
export const MENU_INGREDIENTS_MAX = 15;

/** A dish as the mix queries select it (raw DB shape, ingredients still JSON). */
export interface MenuDishRow {
  id: number;
  name: string;
  country: string;
  region: string;
  course: string;
  temperature: string;
  protein: string;
  ingredients: string;
}

/** A dish plus the day it's on the menu. */
export interface MenuScheduleRow extends MenuDishRow {
  date: string;
}

const zeroed = <T extends string>(values: readonly T[]): Record<T, number> =>
  Object.fromEntries(values.map((v) => [v, 0])) as Record<T, number>;

function emptySlice(): MenuMixSlice {
  return {
    servings: 0,
    dishes: 0,
    region: zeroed(REGIONS),
    course: zeroed(COURSES),
    protein: zeroed(PROTEINS),
    temperature: zeroed(TEMPERATURES),
  };
}

/**
 * Add one serving to a slice. Values outside an enum are counted in `servings`
 * but not in that attribute — `region` has no DB CHECK, so a hand-edited row
 * could carry anything, and silently inventing a chart row for it is worse than
 * a total that doesn't quite add up.
 */
function tally(slice: MenuMixSlice, dish: MenuDishRow) {
  slice.servings += 1;
  if (dish.region in slice.region) slice.region[dish.region as Region] += 1;
  if (dish.course in slice.course) slice.course[dish.course as Course] += 1;
  if (dish.protein in slice.protein) slice.protein[dish.protein as Protein] += 1;
  if (dish.temperature in slice.temperature) slice.temperature[dish.temperature as Temperature] += 1;
}

/** Build a slice from rows, counting distinct dishes as it goes. */
function sliceOf(rows: MenuDishRow[]): MenuMixSlice {
  const slice = emptySlice();
  const ids = new Set<number>();
  for (const row of rows) {
    tally(slice, row);
    ids.add(row.id);
  }
  slice.dishes = ids.size;
  return slice;
}

/** Ingredients column is JSON TEXT; a corrupt row shouldn't take the panel down. */
function parseIngredients(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((i): i is string => typeof i === "string") : [];
  } catch {
    return [];
  }
}

const toServing = (row: MenuScheduleRow): MenuServing => ({
  date: row.date,
  dishId: row.id,
  name: row.name,
  country: row.country,
  region: row.region as Region,
  course: row.course as Course,
  protein: row.protein as Protein,
  temperature: row.temperature as Temperature,
});

/**
 * Assemble the menu-mix payload from every schedule row (joined to its dish) and
 * the active dish pool. `today` splits served from upcoming; rows dated before
 * EPOCH_DATE are ignored (puzzle #1 is the first day the game existed).
 */
export function assembleMenuMix(
  scheduled: MenuScheduleRow[],
  pool: MenuDishRow[],
  today: string,
): MenuMix {
  const inWindow = scheduled.filter((r) => r.date >= EPOCH_DATE);
  // Oldest first, so "last served" is simply the last one seen.
  const served = [...inWindow].filter((r) => r.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = inWindow.filter((r) => r.date > today);

  const countries = new Map<string, { country: string; region: Region; servings: number; lastServed: string }>();
  const ingredients = new Map<string, number>();
  const dishServings = new Map<number, { dishId: number; name: string; servings: number; lastServed: string }>();

  for (const row of served) {
    const country = countries.get(row.country);
    if (country) {
      country.servings += 1;
      country.lastServed = row.date;
    } else {
      countries.set(row.country, {
        country: row.country,
        region: row.region as Region,
        servings: 1,
        lastServed: row.date,
      });
    }

    // Counted per serving, not per dish: a dish served twice puts its
    // ingredients on the menu twice, which is what the pantry chart is about.
    for (const name of parseIngredients(row.ingredients)) {
      ingredients.set(name, (ingredients.get(name) ?? 0) + 1);
    }

    const dish = dishServings.get(row.id);
    if (dish) {
      dish.servings += 1;
      dish.lastServed = row.date;
    } else {
      dishServings.set(row.id, { dishId: row.id, name: row.name, servings: 1, lastServed: row.date });
    }
  }

  const servedIds = new Set(served.map((r) => r.id));

  // Every ranked list is most-served first, ties broken alphabetically so the
  // order stays put between reloads.
  return {
    served: sliceOf(served),
    upcoming: sliceOf(upcoming),
    pool: sliceOf(pool),
    countries: [...countries.values()].sort(
      (a, b) => b.servings - a.servings || a.country.localeCompare(b.country),
    ),
    ingredients: [...ingredients.entries()]
      .map(([name, servings]) => ({ name, servings }))
      .sort((a, b) => b.servings - a.servings || a.name.localeCompare(b.name))
      .slice(0, MENU_INGREDIENTS_MAX),
    repeats: [...dishServings.values()]
      .filter((d) => d.servings > 1)
      .sort((a, b) => b.servings - a.servings || a.name.localeCompare(b.name)),
    neverServed: pool.filter((d) => !servedIds.has(d.id)).length,
    // Every day from puzzle #1 through today should have had a Special; the ones
    // without a schedule row fell back to the deterministic pick.
    unscheduledDays: Math.max(0, puzzleNumber(today) - served.length),
    timeline: served.slice(-MENU_TIMELINE_MAX).map(toServing),
    today,
  };
}
