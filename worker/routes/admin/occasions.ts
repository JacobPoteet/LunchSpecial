// /api/admin/occasions: the Events page. Booked, and read back, exactly like a
// notice on Announcements.
//
// One booking is one run of one costume. The back office books it and never
// edits the costume itself (src/occasions/<id>/). Live bookings may not
// overlap, so every row here is exactly one run and its numbers are its own.
//
// Path note: never "/events". Ad blockers match that word and the dashboard's
// old /events feed died of it (shared/conventions.test.ts).

import { Hono } from "hono";
import {
  OCCASIONS,
  OCCASION_IDS,
  baselineFor,
  findOverlap,
  foldReach,
  occasionStatus,
  parseBookingInput,
  type AdminOccasion,
  type AdminOccasions,
  type OccasionBooking,
  type OccasionTally,
  type SightingRow,
  type Span,
} from "../../../shared/occasions";
import { gameToday } from "../../../shared/time";
import { serverToday } from "../../db";
import { loadBookings } from "../../occasions";

const app = new Hono<{ Bindings: Env }>();

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

/** 2026-10-24 -> 10/24, as the dashboard writes dates. */
const shortDay = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

const countIn = (days: readonly string[], span: Span) => days.filter((d) => d >= span.start && d <= span.end).length;

/**
 * Every booking, latest first, each with what it did once it has started.
 *
 * Reach comes from occasion_views (devices, attributed to the run by the
 * round's own day). Impact is its rounds against the same weekdays just
 * before it, lunch and Nightcap apart, counted by the round's own day. Every
 * surface at once; reach carries its web/Discord split the way a notice's
 * does.
 */
app.get("/occasions", async (c) => {
  const db = c.env.DB;
  const today = serverToday();
  const bookings = (await loadBookings(db)).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id);

  // Read once for every booking: the ledger's first day, and each device's
  // first-ever round as an ET day.
  const [startRes, firstsRes] = await db.batch([
    db.prepare("SELECT MIN(seen_day) AS first FROM occasion_views"),
    db.prepare(
      `SELECT MIN(started_at) AS first FROM analytics_rounds
        WHERE player_id IS NOT NULL AND started_at IS NOT NULL
        GROUP BY player_id`,
    ),
  ]);
  const trackingStart = (startRes.results[0] as { first: string | null } | undefined)?.first ?? null;
  const firstDays = (firstsRes.results as { first: string }[]).map((r) => etDayOf(r.first));

  const tally = async (span: Span) => {
    const res = await db
      .prepare(
        `SELECT CASE WHEN kind = 'nightcap' THEN 'night' ELSE 'lunch' END AS room,
                COUNT(*) AS started, SUM(completed) AS completed, SUM(shared) AS shared
           FROM analytics_rounds
          WHERE play_date BETWEEN ? AND ?
          GROUP BY room`,
      )
      .bind(span.start, span.end)
      .all<TallyRow>();
    const out = { lunch: { ...EMPTY }, night: { ...EMPTY } };
    for (const r of res.results) out[r.room] = { started: r.started, completed: r.completed ?? 0, shared: r.shared ?? 0 };
    return out;
  };

  const events: AdminOccasion[] = await Promise.all(
    bookings.map(async (b): Promise<AdminOccasion> => {
      const status = occasionStatus(b, today);
      if (b.startDate > today) return { ...b, status, reach: null, impact: null };
      const run: Span = { start: b.startDate, end: b.endDate };
      const baseline = baselineFor(run);
      const [during, before, sightings] = await Promise.all([
        tally(run),
        tally(baseline),
        db
          .prepare(
            `SELECT player_id, seen_day, play_day, room, moment, surface FROM occasion_views
              WHERE occasion_id = ? AND play_day BETWEEN ? AND ?`,
          )
          .bind(b.occasionId, run.start, run.end)
          .all<SightingRow>(),
      ]);
      return {
        ...b,
        status,
        reach: foldReach(run, today, sightings.results, trackingStart),
        impact: {
          baseline,
          pending: run.end >= today,
          lunch: { run: during.lunch, baseline: before.lunch },
          night: { run: during.night, baseline: before.night },
          firstTimers: { run: countIn(firstDays, run), baseline: countIn(firstDays, baseline) },
        },
      };
    }),
  );

  const body: AdminOccasions = { today, occasions: OCCASION_IDS.map((id) => OCCASIONS[id]), events };
  return c.json(body);
});

/** Refuse a live booking that lands on another live one: one costume at a time. */
async function overlapError(db: D1Database, input: OccasionBooking, selfId: number | null): Promise<string | null> {
  const clash = findOverlap(input, await loadBookings(db), selfId);
  if (!clash) return null;
  return `Overlaps ${OCCASIONS[clash.occasionId].name} ${shortDay(clash.startDate)} – ${shortDay(clash.endDate)}. Change the dates, or pull that one first.`;
}

app.post("/occasions", async (c) => {
  const parsed = parseBookingInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const clash = await overlapError(c.env.DB, parsed.input, null);
  if (clash) return c.json({ error: clash }, 409);
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
  const clash = await overlapError(c.env.DB, parsed.input, id);
  if (clash) return c.json({ error: clash }, 409);
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

/**
 * Deletes the booking only. Its sightings stay in occasion_views (they are
 * per-device analytics, wiped per device from the Activity tab), but with no
 * booking to attribute them to, the Events page stops showing them.
 */
app.delete("/occasions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Bad id" }, 400);
  await c.env.DB.prepare("DELETE FROM occasion_bookings WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default app;
