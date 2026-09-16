// The admin specials board, folded. The Schedule tab holds one question per row
// — should this dish run on this day — and the answer needs three things the
// schedule table alone doesn't carry: what the dish is, when it last ran, and
// whether anything else on the board already spends it.
//
// The catalogue fetch the page already makes carries all of that, so this fold
// joins the two and states the result. Nothing here queries; the panel hands in
// the schedule window and the dish rows, and asserts on what comes back.
//
// Two rules the fold keeps:
//
// 1. **A serving is a serving, wherever it was measured.** The nearest one to a
//    given day can sit inside the visible window, or outside it in `lastServed`
//    / `nextBooked`, which the dishes query computes against *today*. Those are
//    real dates either way, so the distance from this row's date to them is a
//    real gap. Taking the minimum over all three sources is what stops the board
//    reporting "never served" for a dish that ran the week before the window
//    opens.
// 2. **A close repeat is stated, never blocked.** Autofill skips a dish used
//    within REPEAT_WINDOW_DAYS and the shuffle only rolls dishes that have never
//    been scheduled at all; hand-booking is the path where you might want the
//    repeat, so the row says how close it is and books it anyway.

import type { AdminDishRow, Course, Region, ScheduleEntry } from "./types";
import { COURSES, REGION_LABELS } from "./types";
import { daysBetween } from "./time";

/**
 * The anti-repeat window, mirroring the one autofill enforces in
 * `POST /schedule/autofill`. A booking nearer than this to another serving of
 * the same dish is worth saying out loud on the row.
 */
export const REPEAT_WINDOW_DAYS = 60;

/** Which side of a booking its nearest other serving sits on. */
export type RestSide = "before" | "after";

/** One day of the board, with everything the row needs to draw itself. */
export interface BoardRow {
  date: string;
  dishId: number | null;
  /**
   * The name as the *schedule* reports it. Kept separate from `dish` so a row
   * still names its Special when the catalogue fetch failed or hasn't landed.
   */
  dishName: string | null;
  /** The catalogue row for `dishId`, when there is one. */
  dish: AdminDishRow | null;
  isPast: boolean;
  isToday: boolean;
  /** Whole days to the nearest other serving of this dish, or null if there is none. */
  restDays: number | null;
  /** That serving's date. */
  restDate: string | null;
  restSide: RestSide | null;
  /** `restDays` is inside REPEAT_WINDOW_DAYS — close enough to mention. */
  tooSoon: boolean;
}

/** What the board says about itself, above the rows. */
export interface BoardSummary {
  /** Unbooked days from today forward, inside the window. */
  emptyAhead: number;
  /** The first of them, which is the one worth jumping to. */
  firstGap: string | null;
  /** Booked days from today forward, inside the window. */
  bookedAhead: number;
}

/**
 * Every date this dish is served on, gathered from the visible window and from
 * the two dates the catalogue computes against today. Deduped, since a dish
 * booked inside the window shows up in both.
 */
function servingDates(dishId: number, entries: ScheduleEntry[], dish: AdminDishRow | null): string[] {
  const dates = new Set<string>();
  for (const e of entries) if (e.dishId === dishId) dates.add(e.date);
  if (dish?.lastServed) dates.add(dish.lastServed);
  if (dish?.nextBooked) dates.add(dish.nextBooked);
  return [...dates];
}

/**
 * The board. `entries` is the window as `GET /admin/schedule` returns it, oldest
 * first; `dishes` is the catalogue as `GET /admin/dishes` returns it.
 */
export function buildBoard(
  entries: ScheduleEntry[],
  dishes: AdminDishRow[],
  today: string,
): BoardRow[] {
  const byId = new Map(dishes.map((d) => [d.id, d]));
  return entries.map((entry) => {
    const dish = entry.dishId === null ? null : byId.get(entry.dishId) ?? null;
    let restDays: number | null = null;
    let restDate: string | null = null;
    let restSide: RestSide | null = null;

    if (entry.dishId !== null) {
      for (const date of servingDates(entry.dishId, entries, dish)) {
        // The row's own booking is not a repeat of itself.
        if (date === entry.date) continue;
        const gap = Math.abs(daysBetween(date, entry.date));
        if (restDays === null || gap < restDays) {
          restDays = gap;
          restDate = date;
          restSide = date < entry.date ? "before" : "after";
        }
      }
    }

    return {
      date: entry.date,
      dishId: entry.dishId,
      dishName: entry.dishName,
      dish,
      isPast: entry.date < today,
      isToday: entry.date === today,
      restDays,
      restDate,
      restSide,
      tooSoon: restDays !== null && restDays < REPEAT_WINDOW_DAYS,
    };
  });
}

/** Gaps and bookings from today forward. Past days are settled and don't count. */
export function summarizeBoard(rows: BoardRow[]): BoardSummary {
  let emptyAhead = 0;
  let bookedAhead = 0;
  let firstGap: string | null = null;
  for (const row of rows) {
    if (row.isPast) continue;
    if (row.dishId === null) {
      emptyAhead++;
      if (firstGap === null) firstGap = row.date;
    } else {
      bookedAhead++;
    }
  }
  return { emptyAhead, firstGap, bookedAhead };
}

/** How many booked days the balance line reads, from today. */
export const BALANCE_DAYS = 7;

/** What the next week of bookings looks like, for the line above the rows. */
export interface BoardBalance {
  /** Booked days read, at most BALANCE_DAYS. */
  booked: number;
  /** Regions served, most first; ties by name. */
  regions: Array<{ region: Region; count: number }>;
  /** Courses served, in COURSE order, zero-count ones included. */
  courses: Array<{ course: Course; count: number }>;
  /** Countries booked more than once inside the week. */
  repeats: string[];
}

/**
 * The next BALANCE_DAYS booked days from today, counted by region, course and
 * repeated country. Informational: the autofill avoids these clashes
 * (worker/variety.ts) and a hand booking is told about them, never stopped.
 * Empty days are skipped rather than counted, so a half-booked week reads as
 * what it is.
 */
export function boardBalance(rows: BoardRow[]): BoardBalance {
  const ahead = rows.filter((r) => !r.isPast && r.dish).slice(0, BALANCE_DAYS);
  const regions = new Map<Region, number>();
  const courses = new Map<Course, number>();
  const countries = new Map<string, number>();
  for (const r of ahead) {
    const d = r.dish!;
    regions.set(d.region, (regions.get(d.region) ?? 0) + 1);
    courses.set(d.course, (courses.get(d.course) ?? 0) + 1);
    countries.set(d.country, (countries.get(d.country) ?? 0) + 1);
  }
  return {
    booked: ahead.length,
    regions: [...regions]
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count || REGION_LABELS[a.region].localeCompare(REGION_LABELS[b.region])),
    courses: COURSES.map((course) => ({
      course,
      count: courses.get(course) ?? 0,
    })),
    repeats: [...countries].filter(([, n]) => n > 1).map(([c]) => c).sort(),
  };
}

/**
 * The balance as one line: "Next 7: Europe ×3, Latin America ×2 · 5 entrées,
 * 2 desserts · Italy twice". Null with nothing booked ahead.
 */
export function balanceLine(b: BoardBalance): string | null {
  if (b.booked === 0) return null;
  const regions = b.regions.map((r) => `${REGION_LABELS[r.region]} ×${r.count}`).join(", ");
  const courses = b.courses
    .filter((c) => c.count > 0)
    .map((c) => `${c.count} ${COURSE_PLURALS[c.course][c.count === 1 ? 0 : 1]}`)
    .join(", ");
  const parts = [`Next ${b.booked}: ${regions}`, courses];
  if (b.repeats.length) parts.push(`${b.repeats.join(", ")} twice`);
  return parts.join(" · ");
}

const COURSE_PLURALS: Record<Course, [string, string]> = {
  breakfast: ["breakfast", "breakfasts"],
  appetizer: ["appetizer", "appetizers"],
  entree: ["entrée", "entrées"],
  dessert: ["dessert", "desserts"],
  drink: ["drink", "drinks"],
};

/**
 * Name to dish, for the board's picker. Names are matched case-insensitively and
 * trimmed, and a name two dishes share resolves to neither — booking the wrong
 * one silently is worse than asking you to rename one of them.
 */
export function resolveDishName(name: string, dishes: AdminDishRow[]): AdminDishRow | null {
  const key = name.trim().toLowerCase();
  if (key === "") return null;
  const hits = dishes.filter((d) => d.name.trim().toLowerCase() === key);
  return hits.length === 1 ? hits[0] : null;
}

/** How many suggestions the board's picker offers at once. */
export const DISH_MATCH_LIMIT = 8;

/**
 * Dishes whose **name** contains the query, best first: names that start with it
 * ahead of names that merely contain it, each group keeping the order it came in
 * (the dishes route sorts by name, so that is alphabetical).
 *
 * Name only, on purpose. This replaced a native `<datalist>`, which searches
 * every scrap of text in an option — so listing the country beside a dish meant
 * typing three letters matched a country and the list filled with dishes whose
 * names had nothing to do with what you typed. The country still shows on each
 * suggestion; it just isn't what you're searching.
 *
 * An empty query offers the head of the catalogue rather than nothing, so
 * focusing the field shows what the control does.
 */
export function matchDishes(
  query: string,
  dishes: AdminDishRow[],
  limit: number = DISH_MATCH_LIMIT,
): AdminDishRow[] {
  const key = query.trim().toLowerCase();
  if (key === "") return dishes.slice(0, limit);
  const starts: AdminDishRow[] = [];
  const contains: AdminDishRow[] = [];
  for (const dish of dishes) {
    const name = dish.name.toLowerCase();
    const at = name.indexOf(key);
    if (at === 0) starts.push(dish);
    else if (at > 0) contains.push(dish);
  }
  return [...starts, ...contains].slice(0, limit);
}
