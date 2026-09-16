// /api/admin/announcements: notices posted to players.

import { Hono } from "hono";
import type { AdminAnnouncement, AnnouncementAudience, AnnouncementReach, Surface } from "../../../shared/types";
import { ANNOUNCEMENT_AUDIENCES, SURFACES } from "../../../shared/types";
import { announcementStatus, parseAnnouncementInput } from "../../announcements";

import { serverToday } from "../../db";

import { gameToday } from "../../../shared/time";

const app = new Hono<{ Bindings: Env }>();

// ---- Announcements (notices posted to players) ----
//
// Authored here, shown by the game on Today's Special. See migrations/0015 and
// the pure status/eligibility rules in worker/announcements.ts.

interface AnnouncementDbRow {
  id: number;
  header: string;
  body: string;
  audience: string;
  start_date: string;
  end_date: string;
  is_active: number;
  created_at: string;
}

const zeroBySurface = (): Record<Surface, number> => ({ web: 0, discord: 0 });

/**
 * Every notice, newest window first, each with how many anonymous devices have
 * actually seen it. Reach comes from announcement_views, whose PRIMARY KEY is
 * (announcement_id, player_id) — so COUNT(*) already IS the distinct-device
 * count, and a player can contribute to exactly one ET day.
 */
app.get("/announcements", async (c) => {
  const today = serverToday();
  const [rowsRes, totalRes, surfaceRes, dailyRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id, header, body, audience, start_date, end_date, is_active, created_at
         FROM announcements ORDER BY start_date DESC, id DESC`,
    ),
    c.env.DB.prepare("SELECT announcement_id, COUNT(*) AS n FROM announcement_views GROUP BY announcement_id"),
    c.env.DB.prepare(
      "SELECT announcement_id, surface, COUNT(*) AS n FROM announcement_views GROUP BY announcement_id, surface",
    ),
    // seen_at is UTC and SQLite has no named timezones, so bucket by UTC hour
    // and fold into ET days in JS — the same shape the engagement charts use.
    c.env.DB.prepare(
      `SELECT announcement_id, strftime('%Y-%m-%d %H', seen_at) AS bucket, COUNT(*) AS n
         FROM announcement_views GROUP BY announcement_id, bucket`,
    ),
  ]);

  const totals = new Map<number, number>();
  for (const r of totalRes.results as { announcement_id: number; n: number }[]) {
    totals.set(r.announcement_id, r.n);
  }
  const surfaces = new Map<number, Record<Surface, number>>();
  for (const r of surfaceRes.results as { announcement_id: number; surface: string; n: number }[]) {
    const bucket = surfaces.get(r.announcement_id) ?? zeroBySurface();
    // Rows can only carry a surface from the enum, but a future value shouldn't
    // vanish silently — fold anything unknown into web, as elsewhere.
    bucket[(SURFACES.includes(r.surface as never) ? r.surface : "web") as Surface] += r.n;
    surfaces.set(r.announcement_id, bucket);
  }
  const dailyByAnnouncement = new Map<number, Map<string, number>>();
  for (const r of dailyRes.results as { announcement_id: number; bucket: string; n: number }[]) {
    // Rebuild the instant at mid-hour to stay clear of any boundary rounding.
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    const et = gameToday(instant);
    const days = dailyByAnnouncement.get(r.announcement_id) ?? new Map<string, number>();
    days.set(et, (days.get(et) ?? 0) + r.n);
    dailyByAnnouncement.set(r.announcement_id, days);
  }

  const list: AdminAnnouncement[] = (rowsRes.results as AnnouncementDbRow[]).map((r) => {
    const audience = (ANNOUNCEMENT_AUDIENCES.includes(r.audience as never) ? r.audience : "all") as AnnouncementAudience;
    const isActive = r.is_active === 1;
    const reach: AnnouncementReach = {
      players: totals.get(r.id) ?? 0,
      bySurface: surfaces.get(r.id) ?? zeroBySurface(),
      daily: [...(dailyByAnnouncement.get(r.id) ?? new Map())]
        .map(([date, players]) => ({ date, players: players as number }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
    return {
      id: r.id,
      header: r.header,
      body: r.body,
      audience,
      startDate: r.start_date,
      endDate: r.end_date,
      isActive,
      status: announcementStatus({ startDate: r.start_date, endDate: r.end_date, isActive }, today),
      createdAt: r.created_at,
      reach,
    };
  });
  return c.json(list);
});

app.post("/announcements", async (c) => {
  const parsed = parseAnnouncementInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const a = parsed.input;
  const res = await c.env.DB.prepare(
    `INSERT INTO announcements (header, body, audience, start_date, end_date, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
  )
    .bind(a.header, a.body, a.audience, a.startDate, a.endDate, a.isActive ? 1 : 0)
    .run();
  return c.json({ id: res.meta.last_row_id });
});

app.put("/announcements/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Announcement not found" }, 404);
  const parsed = parseAnnouncementInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const a = parsed.input;
  // Editing a notice never touches its views: the reach it already earned is a
  // record of what happened, not a property of the current wording.
  const res = await c.env.DB.prepare(
    `UPDATE announcements
        SET header = ?, body = ?, audience = ?, start_date = ?, end_date = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?`,
  )
    .bind(a.header, a.body, a.audience, a.startDate, a.endDate, a.isActive ? 1 : 0, id)
    .run();
  if (res.meta.changes === 0) return c.json({ error: "Announcement not found" }, 404);
  return c.json({ id });
});

app.delete("/announcements/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Announcement not found" }, 404);
  // Drop the views explicitly rather than relying on ON DELETE CASCADE, which
  // only fires while foreign-key enforcement is on.
  const [, deleted] = await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM announcement_views WHERE announcement_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id),
  ]);
  if (deleted.meta.changes === 0) return c.json({ error: "Announcement not found" }, 404);
  return c.json({ ok: true });
});

export default app;
