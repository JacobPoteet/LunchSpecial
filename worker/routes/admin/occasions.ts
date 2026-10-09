// /api/admin/occasions: when the diner dresses up, and whether it moved anything.
//
// The back office books and switches occasions; it never edits one. Every
// costume is code (src/occasions/<id>/). The fold that turns bookings into
// costumed days is shared/occasions.ts, run by the game and here alike.
//
// Path note: never "/events". Ad blockers match that word and the dashboard's
// old /events feed died of it (shared/conventions.test.ts).

import { Hono } from "hono";
import {
  OCCASIONS,
  OCCASION_IDS,
  baselineFor,
  foldReach,
  occasionRuns,
  parseBookingInput,
  type AdminOccasions,
  type OccasionReport,
  type OccasionRun,
  type OccasionTally,
  type SightingRow,
  type Span,
} from "../../../shared/occasions";
import { addDays, gameToday } from "../../../shared/time";
import { EPOCH_DATE } from "../../../shared/types";
import { serverToday } from "../../db";
import { loadBookings } from "../../occasions";
import { surfaceClause } from "./shared";

const app = new Hono<{ Bindings: Env }>();

app.get("/occasions", async (c) => {
  const body: AdminOccasions = {
    today: serverToday(),
    occasions: OCCASION_IDS.map((id) => OCCASIONS[id]),
    bookings: await loadBookings(c.env.DB),
  };
  return c.json(body);
});

app.post("/occasions", async (c) => {
  const parsed = parseBookingInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const { occasionId, startDate, endDate, isActive } = parsed.input;
  const res = await c.env.DB.prepare(
    "INSERT INTO occasion_bookings (occasion_id, start_date, end_date, is_active) VALUES (?, ?, ?, ?)",
  )
    .bind(occasionId, startDate, endDate, isActive ? 1 : 0)
    .run();
  return c.json({ id: res.meta.last_row_id });
});

app.put("/occasions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Bad id" }, 400);
  const parsed = parseBookingInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const { occasionId, startDate, endDate, isActive } = parsed.input;
  const res = await c.env.DB.prepare(
    `UPDATE occasion_bookings SET occasion_id = ?, start_date = ?, end_date = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?`,
  )
    .bind(occasionId, startDate, endDate, isActive ? 1 : 0, id)
    .run();
  if (res.meta.changes === 0) return c.json({ error: "No such booking" }, 404);
  return c.json({ ok: true });
});

app.delete("/occasions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Bad id" }, 400);
  await c.env.DB.prepare("DELETE FROM occasion_bookings WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

interface TallyRow {
  room: "lunch" | "night";
  started: number;
  completed: number | null;
  shared: number | null;
}

const EMPTY: OccasionTally = { started: 0, completed: 0, shared: 0 };

/** A UTC `datetime('now')` stamp as the ET day it fell on. */
function etDayOf(stamp: string): string {
  return gameToday(new Date(`${stamp.replace(" ", "T")}Z`));
}

/** How many of these first-play days fall inside the span. */
function countIn(days: readonly string[], span: Span): number {
  return days.filter((d) => d >= span.start && d <= span.end).length;
}

/**
 * Every costumed run so far against the same weekdays just before it.
 *
 * Counted by the round's own day (`play_date`), which is the day the costume
 * was keyed to: an ET day for lunch, the local night key for a Nightcap. A
 * Special and a Nightcap are tallied apart and never pooled. Rates and their
 * intervals are the panel's job (shared/sample.ts), off these raw counts.
 */
app.get("/occasion-report", async (c) => {
  const today = serverToday();
  const { and: surfAnd } = surfaceClause(c);
  // Read past today so a live run carries its booked end, then keep only the
  // runs that have started. A season is 63 days at most, so 70 days is enough.
  const runs = occasionRuns(EPOCH_DATE, addDays(today, 70), await loadBookings(c.env.DB))
    .filter((r) => r.start <= today)
    .reverse();

  // The reach ledger's first day, and each device's first-ever round as an ET
  // day. Both are read once for every run.
  const [startRes, firstsRes] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT MIN(seen_day) AS first FROM occasion_views WHERE 1 = 1${surfAnd}`),
    c.env.DB.prepare(
      `SELECT MIN(started_at) AS first FROM analytics_rounds
        WHERE player_id IS NOT NULL AND started_at IS NOT NULL${surfAnd}
        GROUP BY player_id`,
    ),
  ]);
  const trackingStart = (startRes.results[0] as { first: string | null } | undefined)?.first ?? null;
  const firstDays = (firstsRes.results as { first: string }[]).map((r) => etDayOf(r.first));

  const sightings = async (run: OccasionRun) =>
    (
      await c.env.DB.prepare(
        `SELECT player_id, seen_day, play_day, room, moment, surface FROM occasion_views
          WHERE occasion_id = ? AND play_day BETWEEN ? AND ?${surfAnd}`,
      )
        .bind(run.occasionId, run.start, run.end)
        .all<SightingRow>()
    ).results;

  const tally = async (span: Span) => {
    const res = await c.env.DB.prepare(
      `SELECT CASE WHEN kind = 'nightcap' THEN 'night' ELSE 'lunch' END AS room,
              COUNT(*) AS started, SUM(completed) AS completed, SUM(shared) AS shared
         FROM analytics_rounds
        WHERE play_date BETWEEN ? AND ?${surfAnd}
        GROUP BY room`,
    )
      .bind(span.start, span.end)
      .all<TallyRow>();
    const out = { lunch: { ...EMPTY }, night: { ...EMPTY } };
    for (const r of res.results) {
      out[r.room] = { started: r.started, completed: r.completed ?? 0, shared: r.shared ?? 0 };
    }
    return out;
  };

  const report: OccasionReport = {
    today,
    trackingStart,
    runs: await Promise.all(
      runs.map(async (run) => {
        const baseline = baselineFor(run);
        const [during, before, rows] = await Promise.all([tally(run), tally(baseline), sightings(run)]);
        return {
          ...run,
          baseline,
          pending: run.end >= today,
          lunch: { run: during.lunch, baseline: before.lunch },
          night: { run: during.night, baseline: before.night },
          reach: foldReach(run, today, rows, trackingStart),
          firstTimers: { run: countIn(firstDays, run), baseline: countIn(firstDays, baseline) },
        };
      }),
    ),
  };
  return c.json(report);
});

export default app;
