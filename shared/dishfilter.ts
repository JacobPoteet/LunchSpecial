// Pure filtering/sorting/facet-counting for the admin Dishes list. DB-free and
// DOM-free so it can be unit tested; DishList.tsx is presentation over this.
//
// It exists because the dish list stopped being a list you *read* and became a
// list you *query*. The workflow it serves runs across two screens: the Menu tab
// says "east-asia is under-served and we haven't put out a dessert in a month",
// and this is what turns that sentence into a shortlist you can book from.
//
// Five things are load-bearing:
//
// 1. **"Never" means never scheduled at all — past or future.** The same rule
//    the Tomorrow's Special shuffle picks by (worker/shuffle.ts). A dish booked
//    for next Tuesday has not been served, but it is spoken for, and a
//    shortlist that offers it will book it twice and leave a hole where it was.
//    That's why `menuStatusesOf` reads `nextBooked` and not just `lastServed` —
//    and why the route had to start returning it.
// 2. **A dish can hold two statuses at once.** Served in July and booked again
//    for September is both `served` and `booked`, so status is the one facet
//    where a row has a *set* of values. Selecting a facet value is therefore
//    "has this", never "is only this".
// 3. **Within a facet the selections are OR, across facets they're AND.** Two
//    regions widen; a region plus a course narrows. That's what every faceted
//    search does, and getting it backwards makes multi-select useless.
// 4. **Facet counts ignore their own facet.** The number beside "Dessert" is how
//    many dishes you'd have if you clicked it — which means holding every
//    *other* filter and dropping the course selection. Counting with the facet
//    applied would print "0" beside every unselected chip the moment you picked
//    one, which is exactly when the number is worth reading.
// 5. **Never-served sorts as infinitely rested, not as zero.** A dish that has
//    never been the Special is the *most* rested thing in the catalogue, and a
//    null sorted as 0 buries it under everything ever served.

import type { AdminDishRow, Course, Protein, Region, Temperature } from "./types";
import { COURSES, PROTEINS, REGIONS, TEMPERATURES } from "./types";
import { daysBetween } from "./time";

/** Where a dish stands with the schedule. A row can hold `served` and `booked` together. */
export const MENU_STATUSES = ["never", "served", "booked"] as const;
export type MenuStatus = (typeof MENU_STATUSES)[number];

/** Whether a dish could be booked today, as the Status column already reports it. */
export const DISH_READINESS = ["ready", "incomplete", "inactive"] as const;
export type DishReadiness = (typeof DISH_READINESS)[number];

/** How a dish reached the menu — the fan-submission credit, as a filter. */
export const DISH_SOURCES = ["fan", "kitchen"] as const;
export type DishSource = (typeof DISH_SOURCES)[number];

/**
 * "Rested at least N days" presets. 60 is the one that matters: it's the gap the
 * schedule autofill already refuses to serve inside of, so a dish under it can't
 * be auto-booked anyway.
 */
export const REST_PRESETS = [30, 60, 90] as const;

export const DISH_SORTS = ["rested", "name", "recent", "served", "added"] as const;
export type DishSort = (typeof DISH_SORTS)[number];

/** The multi-select facets, in the order the filter bar draws them. */
export const DISH_FACETS = [
  "statuses",
  "regions",
  "courses",
  "proteins",
  "temperatures",
  "sources",
  "readiness",
  "countries",
] as const;
export type DishFacet = (typeof DISH_FACETS)[number];

/** Every facet's value list. `countries` is open-ended, so it comes from the rows. */
export const FACET_VALUES: Record<Exclude<DishFacet, "countries">, readonly string[]> = {
  statuses: MENU_STATUSES,
  regions: REGIONS,
  courses: COURSES,
  proteins: PROTEINS,
  temperatures: TEMPERATURES,
  sources: DISH_SOURCES,
  readiness: DISH_READINESS,
};

export interface DishFilter {
  /** Free text, matched against name, country and ingredients. Space-separated terms all have to hit. */
  query: string;
  statuses: MenuStatus[];
  regions: Region[];
  courses: Course[];
  proteins: Protein[];
  temperatures: Temperature[];
  sources: DishSource[];
  readiness: DishReadiness[];
  countries: string[];
  /** Only dishes last served at least this many days ago (never-served always qualify). */
  restedDays: number | null;
  sort: DishSort;
}

export const EMPTY_DISH_FILTER: DishFilter = {
  query: "",
  statuses: [],
  regions: [],
  courses: [],
  proteins: [],
  temperatures: [],
  sources: [],
  readiness: [],
  countries: [],
  restedDays: null,
  sort: "name",
};

/**
 * Which statuses a dish holds. Note `never` is exclusive by construction — a row
 * with neither a past nor a future schedule row — while `served` and `booked`
 * can both be true.
 */
export function menuStatusesOf(row: AdminDishRow): MenuStatus[] {
  const held: MenuStatus[] = [];
  if (row.lastServed) held.push("served");
  if (row.nextBooked) held.push("booked");
  return held.length === 0 ? ["never"] : held;
}

/** The same three states the Status column prints, as a filterable value. */
export function readinessOf(row: AdminDishRow): DishReadiness {
  if (!row.isActive) return "inactive";
  return row.schedulable ? "ready" : "incomplete";
}

/**
 * Days since this dish was last the Special, or null if it never has been —
 * which is *more* rested than any number, not less. Callers that sort on it
 * substitute Infinity; callers that threshold on it treat null as passing.
 */
export function restDays(row: AdminDishRow, today: string): number | null {
  return row.lastServed === null ? null : Math.max(0, daysBetween(row.lastServed, today));
}

/** A row's value(s) for one facet, for both matching and counting. */
function facetValuesOf(row: AdminDishRow, facet: DishFacet): string[] {
  switch (facet) {
    case "statuses":
      return menuStatusesOf(row);
    case "regions":
      return [row.region];
    case "courses":
      return [row.course];
    case "proteins":
      return [row.protein];
    case "temperatures":
      return [row.temperature];
    case "sources":
      return [row.isFanSubmission ? "fan" : "kitchen"];
    case "readiness":
      return [readinessOf(row)];
    case "countries":
      return [row.country];
  }
}

/** Empty selection = no constraint. Otherwise the row must hold one of the picked values. */
function matchesFacet(row: AdminDishRow, facet: DishFacet, filter: DishFilter): boolean {
  const picked = filter[facet] as string[];
  if (picked.length === 0) return true;
  return facetValuesOf(row, facet).some((v) => picked.includes(v));
}

/** Every search term has to appear somewhere in the name, country or ingredients. */
function matchesQuery(row: AdminDishRow, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = `${row.name} ${row.country} ${row.ingredients.join(" ")}`.toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

function matchesRest(row: AdminDishRow, restedDays: number | null, today: string): boolean {
  if (restedDays === null) return true;
  const rest = restDays(row, today);
  return rest === null || rest >= restedDays;
}

/** Every constraint except the named facet — the shape both filtering and counting need. */
function matchesAllBut(row: AdminDishRow, filter: DishFilter, today: string, skip: DishFacet | null): boolean {
  if (!matchesQuery(row, filter.query)) return false;
  if (!matchesRest(row, filter.restedDays, today)) return false;
  return DISH_FACETS.every((f) => f === skip || matchesFacet(row, f, filter));
}

/** The rows a filter admits, unsorted. */
export function filterDishes(rows: AdminDishRow[], filter: DishFilter, today: string): AdminDishRow[] {
  return rows.filter((r) => matchesAllBut(r, filter, today, null));
}

/**
 * How many dishes each facet value would yield if it were the only thing changed
 * — i.e. with that facet's own selection dropped. Values with no rows are
 * present as 0 rather than absent, so the chip row keeps a stable order.
 */
export function facetCounts(
  rows: AdminDishRow[],
  filter: DishFilter,
  today: string,
): Record<DishFacet, Record<string, number>> {
  const out = {} as Record<DishFacet, Record<string, number>>;
  for (const facet of DISH_FACETS) {
    const counts: Record<string, number> = {};
    if (facet !== "countries") for (const v of FACET_VALUES[facet]) counts[v] = 0;
    for (const row of rows) {
      // Countries are open-ended: seed from the catalogue, so a country with no
      // matches still shows as 0 instead of vanishing from the picker.
      if (facet === "countries") counts[row.country] ??= 0;
      if (!matchesAllBut(row, filter, today, facet)) continue;
      for (const v of facetValuesOf(row, facet)) counts[v] = (counts[v] ?? 0) + 1;
    }
    out[facet] = counts;
  }
  return out;
}

/** Ties break on name everywhere, so the order never depends on how D1 handed rows back. */
export function sortDishes(rows: AdminDishRow[], sort: DishSort, today: string): AdminDishRow[] {
  const byName = (a: AdminDishRow, b: AdminDishRow) => a.name.localeCompare(b.name);
  const rest = (r: AdminDishRow) => restDays(r, today) ?? Infinity;
  const sorted = [...rows];
  switch (sort) {
    case "name":
      return sorted.sort(byName);
    case "rested":
      // Longest-rested first, never-served at the very top — the booking order.
      return sorted.sort((a, b) => rest(b) - rest(a) || byName(a, b));
    case "recent":
      // Most recently served first; never-served sink to the bottom.
      return sorted.sort((a, b) => rest(a) - rest(b) || byName(a, b));
    case "served":
      return sorted.sort((a, b) => b.timesServed - a.timesServed || rest(b) - rest(a) || byName(a, b));
    case "added":
      // Ids are sequential, so newest-first needs no created_at column.
      return sorted.sort((a, b) => b.id - a.id);
  }
}

/** Filter then sort — what the list actually renders. */
export function selectDishes(rows: AdminDishRow[], filter: DishFilter, today: string): AdminDishRow[] {
  return sortDishes(filterDishes(rows, filter, today), filter.sort, today);
}

/** How many constraints are on, for the "Clear filters" affordance. Sort isn't one. */
export function countActiveFilters(filter: DishFilter): number {
  let n = filter.query.trim() ? 1 : 0;
  if (filter.restedDays !== null) n += 1;
  for (const f of DISH_FACETS) n += (filter[f] as string[]).length > 0 ? 1 : 0;
  return n;
}

/** Toggle one value in one facet, keeping the enum's own order rather than click order. */
export function toggleFacet(filter: DishFilter, facet: DishFacet, value: string): DishFilter {
  const picked = filter[facet] as string[];
  const next = picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value];
  const order = facet === "countries" ? null : FACET_VALUES[facet];
  const sorted = order ? [...next].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : [...next].sort();
  return { ...filter, [facet]: sorted };
}

/**
 * Coerce anything (a restored sessionStorage blob, a link from the Menu tab)
 * into a valid filter, dropping values that aren't in the enums. The catalogue's
 * countries move, so those are taken on trust — an unknown one simply matches
 * nothing.
 */
export function normalizeFilter(raw: unknown): DishFilter {
  const r = (raw ?? {}) as Partial<Record<keyof DishFilter, unknown>>;
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const within = (v: unknown, allowed: readonly string[]) => strings(v).filter((x) => allowed.includes(x));
  const rested = REST_PRESETS.find((d) => d === r.restedDays) ?? null;
  return {
    query: typeof r.query === "string" ? r.query : "",
    statuses: within(r.statuses, MENU_STATUSES) as MenuStatus[],
    regions: within(r.regions, REGIONS) as Region[],
    courses: within(r.courses, COURSES) as Course[],
    proteins: within(r.proteins, PROTEINS) as Protein[],
    temperatures: within(r.temperatures, TEMPERATURES) as Temperature[],
    sources: within(r.sources, DISH_SOURCES) as DishSource[],
    readiness: within(r.readiness, DISH_READINESS) as DishReadiness[],
    countries: strings(r.countries),
    restedDays: rested,
    sort: DISH_SORTS.includes(r.sort as DishSort) ? (r.sort as DishSort) : EMPTY_DISH_FILTER.sort,
  };
}
