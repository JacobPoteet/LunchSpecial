// The Kids' Menu on the wire: what POST /api/kids-menu answers, and the admin
// readout. The rules behind both live in shared/kidsmenu.ts.

import type { MenuFact } from "../kidsmenu";
import type { Rate } from "../sample";
import type { Course, Region } from "./game";

/**
 * One dish on the card. Region rides along for the long menu's subheads; it
 * is the bucket the dish's own country sits in, which a near tile on the board
 * already names, so it says nothing about the Special.
 */
export interface KidsMenuDish {
  id: number;
  name: string;
  country: string;
  region: Region;
  course: Course;
}

/** A fact the menu was narrowed on, printed as a stamped chip. */
export interface KidsMenuFilter {
  fact: MenuFact;
  value: string;
}

export interface KidsMenuInfo {
  dishes: KidsMenuDish[];
  filters: KidsMenuFilter[];
}

/**
 * Card sizes, grouped for the readout: [low, high] inclusive, the last open at
 * the top. Sizes skew hard (most cards are short, a board of blanks prints a
 * long one), so the readout draws these rather than an average.
 */
export const KIDS_MENU_SIZES: ReadonlyArray<readonly [number, number | null]> = [
  [1, 1],
  [2, 3],
  [4, 6],
  [7, 12],
  [13, null],
];

/** The card's printed size, as stamped by the menu route (migrations/0077). */
export interface KidsMenuCards {
  /** ET day of the first stamped size; earlier opens are unmeasured. */
  measuredFrom: string;
  /** Rounds with their first open's size on file. */
  opens: number;
  median: number;
  p90: number;
  /** First opens per KIDS_MENU_SIZES group. */
  sizes: number[];
  /** Of `opens`, the rounds that opened it again at the fifth miss. */
  reopened: number;
}

/**
 * Wins off the card beside a blind pick off the same cards: with N dishes on
 * it and k guesses left, a blind pick wins min(1, k/N) of the time. A gap
 * above the blind line is the player still reading the clues.
 */
export interface KidsMenuChance {
  /** Finished rounds that opened the card, card size known, won. */
  won: Rate | null;
  /** A blind pick's expected wins over the same rounds, as a percentage. */
  blindPct: number | null;
}

/** One size group: rounds that opened the card beside rounds that didn't. */
export interface KidsMenuLikeRow {
  opened: Rate | null;
  without: Rate | null;
}

/**
 * Opened vs didn't, compared within boards that would have printed the same
 * size of card at the fourth miss. The size is rebuilt from the guess ledger
 * for every round, opened or not, so both sides are measured the same way.
 */
export interface KidsMenuLikeBoards {
  /** One per KIDS_MENU_SIZES group. */
  rows: KidsMenuLikeRow[];
  /**
   * Opened minus didn't, in win-rate points, pooled over the groups that have
   * both sides, with its 95% range. Null when no group has both.
   */
  difference: { pts: number; low: number; high: number } | null;
  /** Finished rounds that reached a fourth miss with no full board on file. */
  unmeasured: number;
  /** Rounds whose stamped fourth-miss card matches the rebuilt size. */
  agreement: { n: number; of: number };
}

/**
 * The Menu tab's Kids' Menu readout (GET /api/admin/kids-menu). Every count is
 * lunch rounds that reached a fourth miss since the menu's first tracked order
 * (`measuredFrom`); before that the open is unmeasured, never "nobody opened".
 */
export interface KidsMenuReport {
  /** ET day of the first guess the ledger flagged either way, or null before any. */
  measuredFrom: string | null;
  /** Lunch rounds since then that reached a fourth miss: the ones offered the pill. */
  reached: number;
  /** Devices behind `reached`: a regular can reach it many times. */
  reachedDevices: number;
  /** Of those, the rounds that opened the card, as a rate. */
  opened: Rate | null;
  openedCount: number;
  /** Finished rounds that opened it, won. */
  wonAfterOpen: Rate | null;
  /** Finished rounds that reached a fourth miss and never opened it, won. */
  wonWithout: Rate | null;
  /** Guesses ordered off the card. */
  menuOrders: number;
  /** Of those, the ones that were the Special. */
  orderHits: Rate | null;
  /** Null until a card size is on file. */
  cards: KidsMenuCards | null;
  chance: KidsMenuChance;
  likeBoards: KidsMenuLikeBoards;
}
