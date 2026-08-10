// Pure fold behind "delete my own play-testing" (admin Activity tab): what one
// anonymous device has written into the analytics tables. DB-free so it stays
// unit-testable; the route in routes/admin.ts feeds it three grouped reads.
//
// The device is identified the same way the Activity feed's "mine" filter
// identifies it — the localStorage player id — which is the whole point: the
// summary must describe exactly the rows that filter shows, or the review step
// before an irreversible delete is describing something else.
//
// Two things the SQL deliberately doesn't do:
//
// 1. **Zero-fill happens here.** A GROUP BY only returns the kinds and surfaces
//    this device actually played, and a missing bucket rendered as blank reads as
//    "unknown" where it means "none". The enums come from shared/types.ts, so a
//    device that never opened Discord reports `discord: 0`.
// 2. **The totals are summed over every row, the buckets only over known values.**
//    Neither `kind` nor `surface` is CHECK-constrained in the schema (both are
//    plain defaulted columns — migrations/0007 and /0009), so a hand-edited or
//    backfilled row could carry something outside the enum. Counting it in the
//    total but not in a bucket makes `total` the number the delete will actually
//    remove, which is the number that has to be right.

import type { DeviceDataSummary, RoundKind, StartedByKind, Surface } from "../shared/types";
import { ROUND_KINDS, SURFACES } from "../shared/types";

/** One grouped row of this device's rounds: analytics_rounds by (kind, surface). */
export interface DeviceRoundRow {
  kind: string;
  surface: string;
  rounds: number;
  completed: number;
  shared: number;
  /**
   * SQLite's "YYYY-MM-DD HH:MM:SS" in UTC (or null on an empty group). Compared
   * as strings — that format sorts chronologically, and every row in a given
   * column comes from the same writer, so there's no mixed-shape hazard.
   */
  first_at: string | null;
  last_at: string | null;
}

/** The arrivals ledger (analytics_visits) for this device, already aggregated. */
export interface DeviceVisitRow {
  total: number;
  /** ET calendar days (YYYY-MM-DD) — stamped server-side, so already ET. */
  first_day: string | null;
  last_day: string | null;
}

/** SQLite's stored UTC stamp as a real instant the client can render in any zone. */
function instant(stamp: string | null): string | null {
  return stamp === null ? null : `${stamp.replace(" ", "T")}Z`;
}

/** Chronological min/max over the stored stamp format, ignoring empty groups. */
function earlier(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}
function later(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

/**
 * Fold one device's grouped rows into the review payload shown before a wipe.
 *
 * `visits` and `noticeViews` are passed already-aggregated because they're
 * single-number reads with no grouping to undo — but they're folded in here so
 * the shape the admin reviews and the shape the route returns are built in one
 * place, and a table added to the delete has to be added to the summary too.
 */
export function foldDeviceData(
  playerId: string,
  rounds: Iterable<DeviceRoundRow>,
  visits: DeviceVisitRow,
  noticeViews: number,
): DeviceDataSummary {
  const byKind = Object.fromEntries(ROUND_KINDS.map((k) => [k, 0])) as StartedByKind;
  const bySurface = Object.fromEntries(SURFACES.map((s) => [s, 0])) as Record<Surface, number>;
  let total = 0;
  let completed = 0;
  let shared = 0;
  let firstAt: string | null = null;
  let lastAt: string | null = null;

  for (const r of rounds) {
    const n = Number(r.rounds) || 0;
    total += n;
    completed += Number(r.completed) || 0;
    shared += Number(r.shared) || 0;
    if ((ROUND_KINDS as readonly string[]).includes(r.kind)) byKind[r.kind as RoundKind] += n;
    if ((SURFACES as readonly string[]).includes(r.surface)) bySurface[r.surface as Surface] += n;
    firstAt = earlier(firstAt, r.first_at);
    lastAt = later(lastAt, r.last_at);
  }

  return {
    playerId,
    rounds: { total, completed, shared, byKind, bySurface, firstAt: instant(firstAt), lastAt: instant(lastAt) },
    visits: {
      total: Number(visits.total) || 0,
      firstDay: visits.first_day,
      lastDay: visits.last_day,
    },
    noticeViews: Number(noticeViews) || 0,
  };
}
