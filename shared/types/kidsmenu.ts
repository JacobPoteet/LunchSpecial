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
 * The Menu tab's Kids' Menu readout (GET /api/admin/kids-menu). Every count is
 * lunch rounds that reached a fourth miss since the menu's first tracked order
 * (`measuredFrom`); before that the open is unmeasured, never "nobody opened".
 */
export interface KidsMenuReport {
  /** ET day of the first guess the ledger flagged either way, or null before any. */
  measuredFrom: string | null;
  /** Lunch rounds since then that reached a fourth miss: the ones offered the pill. */
  reached: number;
  /** Of those, the rounds that opened the card, as a rate. */
  opened: Rate | null;
  openedCount: number;
  /** Finished rounds that opened it, won. */
  wonAfterOpen: Rate | null;
  /** Finished rounds that reached a fourth miss and never opened it, won. */
  wonWithout: Rate | null;
  /** Guesses ordered off the card. */
  menuOrders: number;
}
