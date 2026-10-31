// The Worker's half of the Kids' Menu (shared/kidsmenu.ts holds the rules).
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

import {
  KIDS_MENU_SIZES,
  MAX_GUESSES,
  type Dish,
  type KidsMenuCards,
  type KidsMenuInfo,
  type KidsMenuLikeBoards,
  type KidsMenuReport,
} from "../shared/types";
import { medianOf, percentileOf, rate, Z } from "../shared/sample";
import { boardMenu, fitsBoard, MENU_AFTER, type MenuTraits } from "../shared/kidsmenu";
import { rowToDish, type DishDbRow } from "./db";
import { etDayOfUtcStamp } from "./players";

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
  if (ids.length < MENU_AFTER) return { error: "The Kids' Menu opens after the fourth miss" };
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

// ---- The readout ----------------------------------------------------------
//
// Opening the card is the player's choice, and being stuck drives both the
// choice and the outcome, so "won, opened" beside "won, didn't" says nothing
// about what the card does. The readout adds two reads that hold more still:
//
// - Like boards: every round that reached a fourth miss gets the size its card
//   *would* have printed, rebuilt from the guess ledger, opened or not. Rounds
//   are compared within a size group, and the groups pooled.
// - Blind pick: with N on the card and k guesses left, picking blind wins
//   min(1, k/N). Wins above that line are the player still reading the board.
//
// Both stay descriptive. Rounds are not independent either (a regular reaches
// a fourth miss many times), so the ranges run narrow; the device count rides
// beside the round count to say how many people the rounds are.

/** A lunch round that reached a fourth miss, as the readout's query returns it. */
export interface ReachedRoundRow {
  round_id: string;
  player_id: string | null;
  /** SQLite datetime, UTC. */
  started_at: string;
  completed: number;
  solved: number | null;
  kids_menu_at: number | null;
}

/** One of those rounds' ledger rows (guesses 1 to 5). */
export interface BoardGuessRow {
  round_id: string;
  guess_number: number;
  guessed_dish_id: number | null;
  target_dish_id: number | null;
}

/** A kids_menu_opens row (migrations/0077). */
export interface MenuOpenRow {
  round_id: string;
  at_guess: number;
  dishes: number;
  opened_at: string;
}

/** A dish as the rebuild reads it: its tiles, and when it joined the pool. */
export interface PoolDishRow extends MenuTraits {
  id: number;
  is_active: number;
  created_at: string;
}

export interface KidsMenuInput {
  rounds: ReadonlyArray<ReachedRoundRow>;
  guesses: ReadonlyArray<BoardGuessRow>;
  opens: ReadonlyArray<MenuOpenRow>;
  dishes: ReadonlyArray<PoolDishRow>;
  /** Guesses ordered off the card, and how many were the Special. */
  orders: { n: number; hits: number };
}

/** The KIDS_MENU_SIZES group a card size falls in. */
export function sizeGroup(dishes: number): number {
  const i = KIDS_MENU_SIZES.findIndex(([, high]) => high === null || dishes <= high);
  return i === -1 ? KIDS_MENU_SIZES.length - 1 : i;
}

/**
 * How many dishes the card would have printed for a round's first `at`
 * guesses, or null when the ledger can't say (a guess missing, a dish since
 * deleted, a target that disagrees across rows).
 *
 * The pool is rebuilt as of the round's start: active dishes already created
 * by then, and the target always. Deactivations aren't dated, so a dish parked
 * since then is missing from older pools; `agreement` measures how often that
 * moves a size.
 */
export function rebuiltSize(
  round: Pick<ReachedRoundRow, "started_at">,
  board: ReadonlyMap<number, BoardGuessRow>,
  at: number,
  dishes: ReadonlyArray<PoolDishRow>,
  byId: ReadonlyMap<number, PoolDishRow>,
): number | null {
  const rows = Array.from({ length: at }, (_, i) => board.get(i + 1));
  if (rows.some((r) => !r)) return null;
  const targetId = rows[0]!.target_dish_id;
  if (targetId === null || rows.some((r) => r!.target_dish_id !== targetId)) return null;
  const target = byId.get(targetId);
  const guessed = rows.map((r) => (r!.guessed_dish_id === null ? undefined : byId.get(r!.guessed_dish_id)));
  if (!target || guessed.some((g) => !g || g.id === targetId)) return null;
  const onBoard = guessed as PoolDishRow[];
  let n = 0;
  for (const d of dishes) {
    const inPool = d.id === targetId || (d.is_active === 1 && d.created_at <= round.started_at);
    if (inPool && fitsBoard(d, target, onBoard)) n++;
  }
  return n;
}

type Side = { won: number; of: number };

/**
 * One side minus the other, in percentage points, pooled across groups with
 * Mantel-Haenszel weights (n1·n0 / (n1 + n0): a group counts for as much as
 * its smaller side lets it). The range takes each group's variance with one
 * win and one loss added per side (Agresti-Caffo), so a group at 3-of-3 still
 * has a spread. Groups missing a side carry no weight; null when none has both.
 */
export function pooledDifference(
  groups: ReadonlyArray<{ a: Side; b: Side }>,
): { pts: number; low: number; high: number } | null {
  let weight = 0;
  let sum = 0;
  let variance = 0;
  for (const { a, b } of groups) {
    if (a.of === 0 || b.of === 0) continue;
    const w = (a.of * b.of) / (a.of + b.of);
    const pa = (a.won + 1) / (a.of + 2);
    const pb = (b.won + 1) / (b.of + 2);
    weight += w;
    sum += w * (a.won / a.of - b.won / b.of);
    variance += w * w * ((pa * (1 - pa)) / (a.of + 2) + (pb * (1 - pb)) / (b.of + 2));
  }
  if (weight === 0) return null;
  const d = sum / weight;
  const se = Math.sqrt(variance) / weight;
  return {
    pts: Math.round(d * 100),
    low: Math.round(Math.max(-1, d - Z * se) * 100),
    high: Math.round(Math.min(1, d + Z * se) * 100),
  };
}

const emptyLikeBoards = (): KidsMenuLikeBoards => ({
  rows: KIDS_MENU_SIZES.map(() => ({ opened: null, without: null })),
  difference: null,
  unmeasured: 0,
  agreement: { n: 0, of: 0 },
});

/** The card sizes on file: each round's first open. Null before the first. */
function foldCards(opens: ReadonlyArray<MenuOpenRow>): KidsMenuCards | null {
  const byRound = new Map<string, MenuOpenRow[]>();
  for (const o of opens) byRound.set(o.round_id, [...(byRound.get(o.round_id) ?? []), o]);
  if (byRound.size === 0) return null;
  const firsts = [...byRound.values()].map((list) => list.reduce((a, b) => (b.at_guess < a.at_guess ? b : a)));
  const counts = new Map<number, number>();
  for (const f of firsts) counts.set(f.dishes, (counts.get(f.dishes) ?? 0) + 1);
  const sizes = KIDS_MENU_SIZES.map(() => 0);
  for (const f of firsts) sizes[sizeGroup(f.dishes)]++;
  const first = opens.reduce((a, b) => (b.opened_at < a.opened_at ? b : a)).opened_at;
  return {
    measuredFrom: etDayOfUtcStamp(first) ?? first.slice(0, 10),
    opens: firsts.length,
    median: medianOf(counts) ?? 0,
    p90: percentileOf(counts, 0.9) ?? 0,
    sizes,
    reopened: [...byRound.values()].filter((list) => list.length > 1).length,
  };
}

export function foldKidsMenuReport(measuredFrom: string | null, input: KidsMenuInput | null): KidsMenuReport {
  if (measuredFrom === null || !input) {
    return {
      measuredFrom: null,
      reached: 0,
      reachedDevices: 0,
      opened: null,
      openedCount: 0,
      wonAfterOpen: null,
      wonWithout: null,
      menuOrders: 0,
      orderHits: null,
      cards: null,
      chance: { won: null, blindPct: null },
      likeBoards: emptyLikeBoards(),
    };
  }
  const { rounds, opens, dishes } = input;
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const boards = new Map<string, Map<number, BoardGuessRow>>();
  for (const g of input.guesses) {
    const board = boards.get(g.round_id) ?? new Map<number, BoardGuessRow>();
    board.set(g.guess_number, g);
    boards.set(g.round_id, board);
  }
  const stamped = new Map(opens.map((o) => [`${o.round_id}|${o.at_guess}`, o.dishes]));
  const empty = new Map<number, BoardGuessRow>();

  let opened = 0;
  const finishedOpen: Side = { won: 0, of: 0 };
  const finishedNot: Side = { won: 0, of: 0 };
  const groups = KIDS_MENU_SIZES.map(() => ({ a: { won: 0, of: 0 }, b: { won: 0, of: 0 } }));
  const likeBoards = emptyLikeBoards();
  const chance = { won: 0, of: 0, blind: 0 };

  for (const r of rounds) {
    const board = boards.get(r.round_id) ?? empty;
    const size4 = rebuiltSize(r, board, MENU_AFTER, dishes, byId);
    const card4 = stamped.get(`${r.round_id}|${MENU_AFTER}`);
    if (card4 !== undefined && size4 !== null) {
      likeBoards.agreement.of++;
      if (card4 === size4) likeBoards.agreement.n++;
    }
    const at = r.kids_menu_at;
    if (at !== null) opened++;
    if (r.completed !== 1) continue;
    const won = r.solved === 1 ? 1 : 0;
    const side = at !== null ? finishedOpen : finishedNot;
    side.of++;
    side.won += won;

    if (size4 === null) likeBoards.unmeasured++;
    else {
      const g = groups[sizeGroup(size4)][at !== null ? "a" : "b"];
      g.of++;
      g.won += won;
    }

    if (at !== null) {
      // The card the player was handed: the stamp, else the rebuild of that board.
      const n = stamped.get(`${r.round_id}|${at}`) ?? (at === MENU_AFTER ? size4 : rebuiltSize(r, board, at, dishes, byId));
      if (n !== null && n > 0) {
        chance.of++;
        chance.won += won;
        chance.blind += Math.min(1, (MAX_GUESSES - at) / n);
      }
    }
  }

  likeBoards.rows = groups.map(({ a, b }) => ({ opened: rate(a.won, a.of), without: rate(b.won, b.of) }));
  likeBoards.difference = pooledDifference(groups);

  return {
    measuredFrom,
    reached: rounds.length,
    reachedDevices: new Set(rounds.map((r) => r.player_id).filter((p) => p !== null)).size,
    opened: rate(opened, rounds.length),
    openedCount: opened,
    wonAfterOpen: rate(finishedOpen.won, finishedOpen.of),
    wonWithout: rate(finishedNot.won, finishedNot.of),
    menuOrders: input.orders.n,
    orderHits: rate(input.orders.hits, input.orders.n),
    cards: foldCards(opens),
    chance: {
      won: rate(chance.won, chance.of),
      blindPct: chance.of > 0 ? Math.round((chance.blind / chance.of) * 100) : null,
    },
    likeBoards,
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
 * The first open, stamped once per round, and the card's size, once per board
 * (migrations/0077). Never throws: the menu has already been built, and
 * analytics must not break gameplay. A round whose /start was blocked has no
 * row to stamp, which reads as never opened, and gets no size either.
 */
export async function stampOpened(db: D1Database, roundId: string, guesses: number, dishes: number): Promise<void> {
  try {
    await db.batch([
      db
        .prepare("UPDATE analytics_rounds SET kids_menu_at = ? WHERE round_id = ? AND kids_menu_at IS NULL AND kind != 'nightcap'")
        .bind(guesses, roundId),
      db
        .prepare(
          `INSERT OR IGNORE INTO kids_menu_opens (round_id, at_guess, dishes)
           SELECT round_id, ?, ? FROM analytics_rounds WHERE round_id = ? AND kind != 'nightcap'`,
        )
        .bind(guesses, dishes, roundId),
    ]);
  } catch {
    // Swallowed on purpose; see above.
  }
}
