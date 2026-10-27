// The Kids Menu: an opt-in short list of the dishes that still fit — PURE.
//
// After the fourth miss the player can ask for a smaller menu. It lists every
// active dish that matches what the board has already told them, and nothing
// it hasn't: a fact is only used once a guess has earned it, and a miss is
// never applied as a filter (crossing dishes off is the player's own crayon
// work). Ordering from it is an ordinary guess.
//
// Both halves import this file. The Worker builds the menu (the public pool
// carries no attributes, and the facts are worked out from the round's guessed
// dish ids against the target, never taken from the client); the client lays
// it out. Nothing about the order of a menu may hint at the answer, so dishes
// sort by name and sections follow the fixed COURSES and REGIONS orders.

import { COURSES, REGION_LABELS, REGIONS, type Course, type Protein, type Region, type Temperature } from "./types";

/** Misses on the board before the pill appears (four clues seen, two guesses left). */
export const MENU_AFTER = 4;

/** The smallest menu the sizing rule will print. */
export const MENU_FLOOR = 8;

/**
 * "What's in it?" taps per round, drawn as crayon checkmarks. 0 turns peeks
 * off everywhere: the button is not drawn and the Worker refuses the route.
 */
export const MENU_PEEKS = 2;

/**
 * How much a peek shows. Under review in the first pass, so both are built:
 *
 * - `full`: every ingredient of the dish, the player's matched ones marked and
 *   their missed ones struck. Strong: the board prints the Special's
 *   ingredient count, so peeking the answer shows the right count with every
 *   matched ingredient present.
 * - `tried`: only the ingredients the player has already put on the board
 *   (matched or missed), plus "and more" when there are others. No count, so
 *   it says nothing the player's own guesses hadn't tested.
 */
export type PeekStyle = "full" | "tried";
export const PEEK_STYLE: PeekStyle = "full";

/** The four facts a board can earn, in the order the chips print them. */
export const MENU_FACTS = ["region", "course", "temperature", "protein"] as const;
export type MenuFact = (typeof MENU_FACTS)[number];

/** The attributes the sizing rule reads off a dish. */
export interface MenuTraits {
  region: Region;
  course: Course;
  temperature: Temperature;
  protein: Protein;
}

/** What the board has established about the Special: the value of each earned fact. */
export type KnownFacts = Partial<MenuTraits>;

interface Probe extends MenuTraits {
  country: string;
}

/**
 * Region is known once any guess's country tile hit or came near (both mean
 * the same region); course, temperature and protein once any guess hit that
 * tile. The value is the target's, which is the guess's on a hit.
 */
export function knownFacts(guesses: ReadonlyArray<Probe>, target: Probe): KnownFacts {
  const known: KnownFacts = {};
  for (const g of guesses) {
    if (g.country === target.country || g.region === target.region) known.region = target.region;
    if (g.course === target.course) known.course = target.course;
    if (g.temperature === target.temperature) known.temperature = target.temperature;
    if (g.protein === target.protein) known.protein = target.protein;
  }
  return known;
}

/**
 * A filter as the stamped chip says it: the region by the board's own name for
 * the bucket (the one a near tile prints), the rest as the tile's value.
 */
export function filterLabel(fact: MenuFact, value: string): string {
  return fact === "region" ? (REGION_LABELS[value as Region] ?? value) : value;
}

export interface SizedMenu<T> {
  dishes: T[];
  /** The facts the menu was filtered on, in MENU_FACTS order. Printed as stamped chips. */
  filters: MenuFact[];
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/**
 * Over every subset of the known facts (none included), the one whose matching
 * set is the smallest that still holds at least MENU_FLOOR dishes; a tie goes
 * to fewer filters. A pool under the floor gets no filters at all.
 *
 * The answer is always on the menu when it is in `pool`, because it matches
 * every one of its own facts.
 */
export function sizeMenu<T extends MenuTraits & { name: string }>(
  pool: ReadonlyArray<T>,
  known: KnownFacts,
  floor = MENU_FLOOR,
): SizedMenu<T> {
  const earned = MENU_FACTS.filter((f) => known[f] !== undefined);
  let best: SizedMenu<T> | null = null;
  for (let mask = 0; mask < 1 << earned.length; mask++) {
    const filters = earned.filter((_, i) => (mask >> i) & 1);
    const dishes = pool.filter((d) => filters.every((f) => d[f] === known[f]));
    if (dishes.length < floor) continue;
    const better =
      !best ||
      dishes.length < best.dishes.length ||
      (dishes.length === best.dishes.length && filters.length < best.filters.length);
    if (better) best = { dishes, filters };
  }
  const chosen = best ?? { dishes: [...pool], filters: [] };
  return { dishes: [...chosen.dishes].sort(byName), filters: chosen.filters };
}

// ---- Layout -------------------------------------------------------------

/** Up to this many dishes print as one list with no section heads. */
export const MENU_FLAT_MAX = 20;
/** Up to this many, sections by course print open; past it they start folded. */
export const MENU_OPEN_MAX = 60;
/** A course section longer than this gets region subheads, when region isn't a filter. */
export const MENU_SUBHEAD_MIN = 30;

export interface MenuGroup<T> {
  /** Null for the one unnamed group of a section with no subheads. */
  region: Region | null;
  dishes: T[];
}

export interface MenuSection<T> {
  /** Null for the single unnamed section of a short menu. */
  course: Course | null;
  count: number;
  groups: MenuGroup<T>[];
}

export interface MenuLayout<T> {
  sections: MenuSection<T>[];
  /** Sections start folded (a long menu). Each still says how many it holds. */
  folded: boolean;
}

/**
 * Twenty or fewer: one list. More: a section per course in COURSES order,
 * open up to MENU_OPEN_MAX and folded past it. A long section on a menu that
 * isn't filtered by region splits by region in REGIONS order. Every order here
 * is fixed by the vocabulary, never by the dishes, so a layout can't point.
 */
export function layoutMenu<T extends { name: string; course: Course; region: Region }>(
  dishes: ReadonlyArray<T>,
  filters: ReadonlyArray<MenuFact>,
): MenuLayout<T> {
  const sorted = [...dishes].sort(byName);
  if (sorted.length <= MENU_FLAT_MAX) {
    return { sections: [{ course: null, count: sorted.length, groups: [{ region: null, dishes: sorted }] }], folded: false };
  }
  const sections: MenuSection<T>[] = [];
  for (const course of COURSES) {
    const inCourse = sorted.filter((d) => d.course === course);
    if (inCourse.length === 0) continue;
    const split = inCourse.length > MENU_SUBHEAD_MIN && !filters.includes("region");
    const groups: MenuGroup<T>[] = split
      ? REGIONS.map((region) => ({ region, dishes: inCourse.filter((d) => d.region === region) })).filter(
          (g) => g.dishes.length > 0,
        )
      : [{ region: null, dishes: inCourse }];
    sections.push({ course, count: inCourse.length, groups });
  }
  return { sections, folded: sorted.length > MENU_OPEN_MAX };
}

// ---- Peeks --------------------------------------------------------------

export type PeekVerdict = "ok" | "repeat" | "off" | "off-menu" | "guessed" | "spent";

export interface PeekInput {
  dishId: number;
  /** Dish ids the menu printed for this round. */
  menuIds: ReadonlyArray<number>;
  guessedIds: ReadonlyArray<number>;
  /** Dishes this round has already peeked. */
  peeked: ReadonlyArray<number>;
  limit?: number;
}

/**
 * Whether a peek is served. Peeking the same dish again is free (`repeat`, the
 * answer the round already holds); a guessed dish has no peek, since its
 * ingredients are on the board.
 */
export function peekVerdict({ dishId, menuIds, guessedIds, peeked, limit = MENU_PEEKS }: PeekInput): PeekVerdict {
  if (limit <= 0) return "off";
  if (!menuIds.includes(dishId)) return "off-menu";
  if (guessedIds.includes(dishId)) return "guessed";
  if (peeked.includes(dishId)) return "repeat";
  if (peeked.length >= limit) return "spent";
  return "ok";
}

export type PeekMark = "matched" | "missed" | "untried";

export interface PeekLine {
  ingredient: string;
  mark: PeekMark;
}

export interface PeekCard {
  lines: PeekLine[];
  /** `tried` style only: the dish has ingredients the board hasn't tested. */
  more: boolean;
}

/**
 * One dish's ingredients against the board. `matched` is every ingredient a
 * guess shared with the Special; `missed` every guessed ingredient the Special
 * lacks. Both are already on the player's board, so the marks add nothing.
 */
export function peekCard(
  ingredients: ReadonlyArray<string>,
  board: { matched: ReadonlySet<string>; missed: ReadonlySet<string> },
  style: PeekStyle = PEEK_STYLE,
): PeekCard {
  const lines = ingredients.map<PeekLine>((ingredient) => ({
    ingredient,
    mark: board.matched.has(ingredient) ? "matched" : board.missed.has(ingredient) ? "missed" : "untried",
  }));
  if (style === "full") return { lines, more: false };
  const tried = lines.filter((l) => l.mark !== "untried");
  return { lines: tried, more: tried.length < lines.length };
}

/** The board's ingredient knowledge, worked out from the guessed dishes and the Special. */
export function boardIngredients(
  guessed: ReadonlyArray<{ ingredients: ReadonlyArray<string> }>,
  target: { ingredients: ReadonlyArray<string> },
): { matched: Set<string>; missed: Set<string> } {
  const inTarget = new Set(target.ingredients);
  const matched = new Set<string>();
  const missed = new Set<string>();
  for (const g of guessed) for (const i of g.ingredients) (inTarget.has(i) ? matched : missed).add(i);
  return { matched, missed };
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
