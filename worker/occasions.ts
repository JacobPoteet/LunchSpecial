// Occasion bookings out of D1. The decision itself is the pure fold in
// shared/occasions.ts; this only reads the rows it folds.

import { isOccasionId, occasionOn, type OccasionBooking, type OccasionId } from "../shared/occasions";

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
