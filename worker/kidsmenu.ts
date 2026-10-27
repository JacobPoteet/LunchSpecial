// The Worker's half of the Kids Menu (shared/kidsmenu.ts holds the rules).
//
// The Worker keeps no record of a round, so the client sends the dish ids on
// its board and the Worker reads the board itself, by comparing each of those
// dishes to the target it resolves the usual way. A client can name dishes it
// never ordered; that narrows the menu early, which /reveal already gives away
// for less effort (the Wordle trust model). What it can never do is name a
// tile result.
//
// The request checks and the menu itself are pure and tested beside this
// file; the loaders and the one write are below them.

import { MAX_GUESSES, type Dish, type KidsMenuInfo, type KidsMenuReport } from "../shared/types";
import { rate } from "../shared/sample";
import { boardMenu, MENU_AFTER } from "../shared/kidsmenu";
import { rowToDish, type DishDbRow } from "./db";

export interface MenuRequest {
  guessed: number[];
}

/**
 * The board, as the client sends it: distinct integer dish ids, at least
 * MENU_AFTER of them and fewer than MAX_GUESSES (a board of six is over).
 */
export function parseGuessed(raw: unknown): MenuRequest | { error: string } {
  if (!Array.isArray(raw)) return { error: "guessed must be a list of dish ids" };
  const ids = raw.map(Number);
  if (!ids.every((n) => Number.isInteger(n) && n > 0)) return { error: "guessed must be a list of dish ids" };
  if (new Set(ids).size !== ids.length) return { error: "guessed repeats a dish" };
  if (ids.length < MENU_AFTER) return { error: "The Kids Menu opens after the fourth miss" };
  if (ids.length >= MAX_GUESSES) return { error: "The round is over" };
  return { guessed: ids };
}

/**
 * The menu for one board. Null when the board is not one that could ask for
 * it: a guessed id the catalogue doesn't have, or the target among them (a
 * won round).
 */
export function buildMenu(pool: ReadonlyArray<Dish>, guessed: ReadonlyArray<Dish>, guessedIds: ReadonlyArray<number>, target: Dish): KidsMenuInfo | null {
  if (guessed.length !== guessedIds.length) return null;
  if (guessedIds.includes(target.id)) return null;
  // The target always prints, even when it has since been deactivated (an old
  // Leftover, an admin preview of a parked dish): a menu without the answer on
  // it would be a lie.
  const withTarget = pool.some((d) => d.id === target.id) ? pool : [...pool, target];
  const menu = boardMenu(withTarget, target, guessed);
  return {
    dishes: menu.dishes.map(({ id, name, country, region, course }) => ({ id, name, country, region, course })),
    filters: menu.filters.map((fact) => ({ fact, value: menu.known[fact] as string })),
  };
}

/** The readout's totals as the route counts them; see KidsMenuReport. */
export interface KidsMenuTotalsRow {
  reached: number;
  opened: number;
  opened_finished: number;
  opened_won: number;
  unopened_finished: number;
  unopened_won: number;
  menu_orders: number;
}

export function foldKidsMenuReport(measuredFrom: string | null, row: KidsMenuTotalsRow | undefined): KidsMenuReport {
  const n = (v: unknown) => Number(v) || 0;
  if (measuredFrom === null || !row) {
    return { measuredFrom: null, reached: 0, opened: null, openedCount: 0, wonAfterOpen: null, wonWithout: null, menuOrders: 0 };
  }
  return {
    measuredFrom,
    reached: n(row.reached),
    opened: rate(n(row.opened), n(row.reached)),
    openedCount: n(row.opened),
    wonAfterOpen: rate(n(row.opened_won), n(row.opened_finished)),
    wonWithout: rate(n(row.unopened_won), n(row.unopened_finished)),
    menuOrders: n(row.menu_orders),
  };
}

// ---- D1 -------------------------------------------------------------------

/** Every active dish, the menu's pool. */
export async function loadMenuPool(db: D1Database): Promise<Dish[]> {
  const res = await db.prepare("SELECT * FROM dishes WHERE is_active = 1").all<DishDbRow>();
  return res.results.map(rowToDish);
}

/** The board's dishes, in the order sent; an unknown id is simply missing. */
export async function loadGuessed(db: D1Database, ids: ReadonlyArray<number>): Promise<Dish[]> {
  const res = await db
    .prepare(`SELECT * FROM dishes WHERE id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<DishDbRow>();
  const byId = new Map(res.results.map((r) => [r.id, rowToDish(r)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * The first open, stamped once per round. Never throws: the menu has already
 * been built, and analytics must not break gameplay. A round whose /start was
 * blocked has no row to stamp, which reads as never opened.
 */
export async function stampOpened(db: D1Database, roundId: string, guesses: number): Promise<void> {
  try {
    await db
      .prepare("UPDATE analytics_rounds SET kids_menu_at = ? WHERE round_id = ? AND kids_menu_at IS NULL AND kind != 'nightcap'")
      .bind(guesses, roundId)
      .run();
  } catch {
    // Swallowed on purpose; see above.
  }
}
