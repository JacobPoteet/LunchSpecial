// The Kids' Menu: an opt-in short list of the dishes that still fit — PURE.
//
// After the fourth miss the player can ask for a smaller menu. It lists every
// active dish that agrees with every tile the board has printed, hits and
// misses alike: a dish from a region a country tile ruled out, or with a
// course, temperature or protein a tile missed on, can't be the Special and
// never prints. Ingredients are deliberately left out: matched and missed
// ingredients, with the count the board prints, pin the answer down almost
// every time, and the menu would solve the round instead of shortening it.
// Circling a dish and ordering it is an ordinary guess.
//
// Both halves import this file. The Worker builds the menu (the public pool
// carries no attributes, and the board is read from the round's guessed dish
// ids against the target, never from the client's claims); the client lays it
// out. Nothing about the order of a menu may hint at the answer, so dishes
// sort by name and sections follow the fixed COURSES and REGIONS orders.

import { COURSES, REGION_LABELS, REGIONS, type Course, type Protein, type Region, type Temperature } from "./types";

/** Misses on the board before the pill appears (four clues seen, two guesses left). */
export const MENU_AFTER = 4;

/** The facts a board can confirm, in the order the stamps print them. */
export const MENU_FACTS = ["country", "region", "course", "temperature", "protein"] as const;
export type MenuFact = (typeof MENU_FACTS)[number];

/** The attributes the board's tiles compare. */
export interface MenuTraits {
  country: string;
  region: Region;
  course: Course;
  temperature: Temperature;
  protein: Protein;
}

/** What the board has confirmed about the Special: the value of each fact a tile hit. */
export type KnownFacts = Partial<MenuTraits>;

const TILES = ["course", "temperature", "protein"] as const;

/**
 * Whether `dish` could still be the Special after `guesses`, read tile by
 * tile the way the board printed them:
 *
 * | Country tile | Leaves                                       |
 * |---|---|
 * | hit          | that country only                            |
 * | near         | that region, minus the guess's own country   |
 * | miss         | every region but the guess's                 |
 *
 * Course, temperature and protein: a hit keeps that value only, a miss rules
 * it out. The Special fits its own board, so it is always on the menu.
 */
export function fitsBoard(dish: MenuTraits, target: MenuTraits, guesses: ReadonlyArray<MenuTraits>): boolean {
  for (const g of guesses) {
    if (g.country === target.country) {
      if (dish.country !== g.country) return false;
    } else if (g.region === target.region) {
      if (dish.region !== g.region || dish.country === g.country) return false;
    } else if (dish.region === g.region) {
      return false;
    }
    for (const t of TILES) {
      if (g[t] === target[t] ? dish[t] !== g[t] : dish[t] === g[t]) return false;
    }
  }
  return true;
}

/**
 * The facts the board has confirmed, for the stamps: the country once a
 * country tile hit, else the region once one came near; course, temperature
 * and protein once a tile hit. Misses narrow the menu but print no stamp.
 */
export function confirmedFacts(guesses: ReadonlyArray<MenuTraits>, target: MenuTraits): KnownFacts {
  const known: KnownFacts = {};
  for (const g of guesses) {
    if (g.country === target.country) known.country = target.country;
    else if (g.region === target.region) known.region = target.region;
    for (const t of TILES) if (g[t] === target[t]) (known as Record<string, string>)[t] = target[t];
  }
  // A known country already says its region.
  if (known.country) delete known.region;
  return known;
}

/**
 * A stamp as it prints: the region by the board's own name for the bucket
 * (the one a near tile prints), the rest as the tile's value.
 */
export function filterLabel(fact: MenuFact, value: string): string {
  return fact === "region" ? (REGION_LABELS[value as Region] ?? value) : value;
}

/**
 * The line under the card's title: what the list is, in one short sentence.
 * The Order button at the foot says the rest.
 */
export function menuBlurb(dishes: number): string {
  return dishes === 1 ? "Only 1 dish could still be the answer." : `${dishes} dishes could still be the answer.`;
}

export interface BoardMenu<T> {
  dishes: T[];
  /** The confirmed facts, in MENU_FACTS order. Printed as stamped chips. */
  filters: MenuFact[];
  known: KnownFacts;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** Every dish in `pool` that fits the board, by name, with the stamps to print over it. */
export function boardMenu<T extends MenuTraits & { name: string }>(
  pool: ReadonlyArray<T>,
  target: MenuTraits,
  guesses: ReadonlyArray<MenuTraits>,
): BoardMenu<T> {
  const known = confirmedFacts(guesses, target);
  return {
    dishes: pool.filter((d) => fitsBoard(d, target, guesses)).sort(byName),
    filters: MENU_FACTS.filter((f) => known[f] !== undefined),
    known,
  };
}

// ---- Layout -------------------------------------------------------------

/** Up to this many dishes print as one list with no section heads. */
export const MENU_FLAT_MAX = 20;
/** A course section longer than this gets region subheads, when the board hasn't placed the Special. */
export const MENU_SUBHEAD_MIN = 30;

export interface MenuGroup<T> {
  /** Null for the one unnamed group of a section with no subheads. */
  region: Region | null;
  dishes: T[];
}

export interface MenuSection<T> {
  /** Null for the single unnamed section: a short menu, or one with a single course on it. */
  course: Course | null;
  count: number;
  groups: MenuGroup<T>[];
}

export interface MenuLayout<T> {
  sections: MenuSection<T>[];
}

/**
 * Twenty or fewer: one list. More: a heading per course in COURSES order, or
 * none when every dish shares a course (the stamp already says it). A long
 * section on a menu with no region or country stamp splits by region in
 * REGIONS order. Every dish is always on show: nothing folds, because a folded
 * menu is a card with nothing on it to order. Every order here is fixed by the
 * vocabulary, never by the dishes, so a layout can't point.
 */
export function layoutMenu<T extends { name: string; course: Course; region: Region }>(
  dishes: ReadonlyArray<T>,
  filters: ReadonlyArray<MenuFact>,
): MenuLayout<T> {
  const sorted = [...dishes].sort(byName);
  if (sorted.length <= MENU_FLAT_MAX) {
    return { sections: [{ course: null, count: sorted.length, groups: [{ region: null, dishes: sorted }] }] };
  }
  const sections: MenuSection<T>[] = [];
  for (const course of COURSES) {
    const inCourse = sorted.filter((d) => d.course === course);
    if (inCourse.length === 0) continue;
    const split = inCourse.length > MENU_SUBHEAD_MIN && !filters.includes("region") && !filters.includes("country");
    const groups: MenuGroup<T>[] = split
      ? REGIONS.map((region) => ({ region, dishes: inCourse.filter((d) => d.region === region) })).filter(
          (g) => g.dishes.length > 0,
        )
      : [{ region: null, dishes: inCourse }];
    sections.push({ course, count: inCourse.length, groups });
  }
  if (sections.length === 1) sections[0].course = null;
  return { sections };
}

// ---- The pill and its coach card ----------------------------------------

/** Whether the pill is on the order bar: a round still playing with at least MENU_AFTER misses. */
export function kidsMenuOpen(status: string, guesses: number): boolean {
  return status === "playing" && guesses >= MENU_AFTER;
}

/** The one-time coach card: the first round a device could open the menu. */
export function kidsMenuIntroDue({ seen, status, guesses }: { seen: boolean; status: string; guesses: number }): boolean {
  return !seen && kidsMenuOpen(status, guesses);
}
