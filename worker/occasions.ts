// Occasion bookings out of D1. The decision itself is the pure fold in
// shared/occasions.ts; this only reads the rows it folds.

import {
  OCCASION_MOMENTS,
  OCCASION_ROOMS,
  isOccasionId,
  occasionOn,
  type OccasionBooking,
  type OccasionId,
  type OccasionMoment,
  type OccasionRoom,
  type OccasionSighting,
} from "../shared/occasions";
import { addDays } from "../shared/time";
import { EPOCH_DATE, SURFACES, type Surface } from "../shared/types";
import { isValidDateString } from "./game";
import { isAnalyticsId } from "./guesslog";

export interface OccasionBookingRow {
  id: number;
  occasion_id: string;
  start_date: string;
  end_date: string;
  is_active: number;
}

/** A row naming an occasion the code no longer has is dropped, never guessed at. */
export function toBooking(r: OccasionBookingRow): (OccasionBooking & { id: number }) | null {
  if (!isOccasionId(r.occasion_id)) return null;
  return { id: r.id, occasionId: r.occasion_id, startDate: r.start_date, endDate: r.end_date, isActive: r.is_active === 1 };
}

export async function loadBookings(db: D1Database): Promise<(OccasionBooking & { id: number })[]> {
  const res = await db
    .prepare("SELECT id, occasion_id, start_date, end_date, is_active FROM occasion_bookings ORDER BY start_date, id")
    .all<OccasionBookingRow>();
  return res.results.flatMap((r) => toBooking(r) ?? []);
}

/**
 * The costume a round dated `day` was played in, for the beacon stamp. Null on
 * a lookup failure: a decoration must never cost a round its row.
 */
export async function occasionFor(db: D1Database, day: string): Promise<OccasionId | null> {
  try {
    return occasionOn(day, await loadBookings(db));
  } catch {
    return null;
  }
}

/**
 * Check a sighting before it is written. Two rules beyond shape:
 *
 * - The costume must be the one the calendar put on `playDay`. A sighting is
 *   evidence the costume reached someone, and a `?occasion=` override, a stale
 *   tab or a hand-written request is not; the client only sends from a real
 *   one, and this is the belt to that.
 * - `playDay` may not run ahead of today by more than the game's own two days
 *   of slack (time zones at the bar), and never before Puzzle #1's eve.
 */
export function parseSighting(
  raw: unknown,
  bookings: readonly OccasionBooking[],
  today: string,
): { sighting: OccasionSighting } | { error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (!isOccasionId(b.occasionId)) return { error: "Unknown occasion" };
  if (!isAnalyticsId(b.playerId)) return { error: "Invalid player id" };
  if (!OCCASION_ROOMS.includes(b.room as never)) return { error: "Unknown room" };
  if (!OCCASION_MOMENTS.includes(b.moment as never)) return { error: "Unknown moment" };
  const playDay = typeof b.playDay === "string" ? b.playDay : "";
  if (!isValidDateString(playDay) || playDay > addDays(today, 2) || playDay < addDays(EPOCH_DATE, -1)) {
    return { error: "Invalid day" };
  }
  if (occasionOn(playDay, bookings) !== b.occasionId) return { error: "Not in costume that day" };
  const surface = SURFACES.includes(b.surface as never) ? (b.surface as Surface) : "web";
  return {
    sighting: {
      occasionId: b.occasionId,
      playerId: b.playerId,
      playDay,
      room: b.room as OccasionRoom,
      moment: b.moment as OccasionMoment,
      surface,
    },
  };
}
