import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type {
  AdminAnnouncement,
  AdminDashboard,
  AdminDishDetail,
  AdminDishInput,
  AdminDishRow,
  AnalyticsDay,
  AnalyticsEvent,
  AnalyticsEventType,
  AnalyticsPeriod,
  AnalyticsSummary,
  AnnouncementAudience,
  AnnouncementReach,
  DashboardAnnouncement,
  DeviceDataDeleted,
  DishRequest,
  Experiment,
  ExperimentInput,
  ExperimentMetric,
  ExperimentReport,
  PlayerSplit,
  RoundKind,
  ScheduleEntry,
  StartedByKind,
  Surface,
} from "../../shared/types";
import {
  ANALYTICS_EVENTS_MAX,
  ANALYTICS_EVENTS_PAGE,
  ANNOUNCEMENT_AUDIENCES,
  COURSES,
  EXPERIMENT_LIMITS,
  EXPERIMENT_METRICS,
  MAX_GUESSES,
  PROTEINS,
  REGIONS,
  ROUND_KINDS,
  SURFACES,
  TEMPERATURES,
} from "../../shared/types";
import { announcementStatus, parseAnnouncementInput } from "../announcements";
import { foldDayService, foldPace, foldSolveTimes, type DayHourRow, type PaceRow, type SolveTimeRow } from "../service";
import { foldGrowth, type GrowthRow } from "../growth";
import { foldCountries, type CountryRow } from "../countries";
import { foldDeviceData, type DeviceRoundRow, type DeviceVisitRow } from "../device";
import { foldDishStats, type DishMetaRow, type DishStatRow } from "../dishstats";
import { foldExperimentSeries, type ExperimentHourRow } from "../experiments";
import { foldFunnel, type FunnelBucketRow } from "../funnel";
import { foldRhythm, type RhythmRow } from "../rhythm";
import {
  createToken,
  passwordMatches,
  PREVIEW_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  verifyToken,
} from "../auth";
import { rowToDish, serverToday, type DishDbRow } from "../db";
import { isValidDateString } from "../game";
import {
  etDayOfUtcStamp,
  foldPlayerActivity,
  foldRetention,
  playersAllTime,
  playersOn,
  type PlayerBucketRow,
} from "../players";
import { assembleMenuMix, type MenuDishRow, type MenuScheduleRow } from "../menu";
import { gameToday, msUntilGameMidnight } from "../../shared/time";

const app = new Hono<{ Bindings: Env }>();

async function isLoggedIn(c: Context, secret: string) {
  const cookie = getCookie(c, SESSION_COOKIE);
  if (!cookie) return false;
  return (await verifyToken(cookie, secret)) === "session";
}

app.post("/login", async (c) => {
  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.password || !(await passwordMatches(body.password, c.env.ADMIN_PASSWORD))) {
    return c.json({ error: "Wrong password" }, 401);
  }
  const token = await createToken("session", SESSION_TTL_MS, c.env.SESSION_SECRET);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return c.json({ ok: true });
});

app.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/session", async (c) => {
  return c.json({ loggedIn: await isLoggedIn(c, c.env.SESSION_SECRET) });
});

// Everything below requires a valid session.
app.use("*", async (c, next) => {
  if (!(await isLoggedIn(c, c.env.SESSION_SECRET))) {
    return c.json({ error: "Not logged in" }, 401);
  }
  await next();
});

interface AdminDishDbRow extends DishDbRow {
  clue_count: number;
  last_served: string | null;
}

function toAdminRow(row: AdminDishDbRow): AdminDishRow {
  const dish = rowToDish(row);
  return {
    ...dish,
    clueCount: row.clue_count,
    lastServed: row.last_served,
    schedulable: dish.ingredients.length >= 3 && row.clue_count === 5,
  };
}

app.get("/dishes", async (c) => {
  const res = await c.env.DB
    .prepare(
      `SELECT d.*,
         (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count,
         (SELECT MAX(s.date) FROM schedule s WHERE s.dish_id = d.id AND s.date <= ?) AS last_served
       FROM dishes d ORDER BY d.name`,
    )
    .bind(serverToday())
    .all<AdminDishDbRow>();
  return c.json(res.results.map(toAdminRow));
});

app.get("/dishes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [dishRes, cluesRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT * FROM dishes WHERE id = ?").bind(id),
    c.env.DB.prepare("SELECT text FROM clues WHERE dish_id = ? ORDER BY order_index").bind(id),
  ]);
  const row = dishRes.results[0] as DishDbRow | undefined;
  if (!row) return c.json({ error: "Dish not found" }, 404);
  const clues = (cluesRes.results as { text: string }[]).map((r) => r.text);
  const detail: AdminDishDetail = { ...rowToDish(row), clues };
  return c.json(detail);
});

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateDishInput(body: unknown): { dish: AdminDishInput } | { error: string } {
  const b = body as Partial<AdminDishInput>;
  if (!b || typeof b.name !== "string" || !b.name.trim()) return { error: "Name is required" };
  if (typeof b.country !== "string" || !b.country.trim()) return { error: "Country is required" };
  if (!REGIONS.includes(b.region as never)) return { error: "Invalid region" };
  if (!COURSES.includes(b.course as never)) return { error: "Invalid course" };
  if (!TEMPERATURES.includes(b.temperature as never)) return { error: "Invalid temperature" };
  if (!PROTEINS.includes(b.protein as never)) return { error: "Invalid protein" };
  if (!Array.isArray(b.ingredients) || b.ingredients.some((i) => typeof i !== "string")) {
    return { error: "Ingredients must be a list of strings" };
  }
  if (!Array.isArray(b.clues) || b.clues.length > 5 || b.clues.some((t) => typeof t !== "string")) {
    return { error: "Clues must be a list of up to 5 strings" };
  }
  const ingredients = [...new Set(b.ingredients.map((i) => i.trim().toLowerCase()).filter(Boolean))];
  const clues = b.clues.map((t) => t.trim()).filter(Boolean);
  return {
    dish: {
      name: b.name.trim(),
      country: b.country.trim(),
      region: b.region!,
      course: b.course!,
      temperature: b.temperature!,
      protein: b.protein!,
      ingredients,
      isActive: b.isActive !== false,
      isFanSubmission: b.isFanSubmission === true,
      clues,
    },
  };
}

async function replaceClues(db: D1Database, dishId: number, clues: string[]) {
  const statements = [db.prepare("DELETE FROM clues WHERE dish_id = ?").bind(dishId)];
  clues.forEach((text, i) => {
    statements.push(
      db.prepare("INSERT INTO clues (dish_id, order_index, text) VALUES (?, ?, ?)").bind(dishId, i + 1, text),
    );
  });
  await db.batch(statements);
}

app.post("/dishes", async (c) => {
  const parsed = validateDishInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const d = parsed.dish;
  try {
    const res = await c.env.DB
      .prepare(
        `INSERT INTO dishes (name, slug, country, region, course, temperature, protein, ingredients, is_active,
           is_fan_submission)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(
        d.name,
        slugify(d.name),
        d.country,
        d.region,
        d.course,
        d.temperature,
        d.protein,
        JSON.stringify(d.ingredients),
        d.isActive ? 1 : 0,
        d.isFanSubmission ? 1 : 0,
      )
      .first<{ id: number }>();
    await replaceClues(c.env.DB, res!.id, d.clues);
    return c.json({ id: res!.id });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes("UNIQUE") ? "A dish with that name already exists" : "Save failed";
    return c.json({ error: msg }, 400);
  }
});

app.put("/dishes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = validateDishInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const d = parsed.dish;
  try {
    const res = await c.env.DB
      .prepare(
        `UPDATE dishes SET name = ?, slug = ?, country = ?, region = ?, course = ?, temperature = ?,
           protein = ?, ingredients = ?, is_active = ?, is_fan_submission = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        d.name,
        slugify(d.name),
        d.country,
        d.region,
        d.course,
        d.temperature,
        d.protein,
        JSON.stringify(d.ingredients),
        d.isActive ? 1 : 0,
        d.isFanSubmission ? 1 : 0,
        id,
      )
      .run();
    if (res.meta.changes === 0) return c.json({ error: "Dish not found" }, 404);
    await replaceClues(c.env.DB, id, d.clues);
    return c.json({ id });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes("UNIQUE") ? "A dish with that name already exists" : "Save failed";
    return c.json({ error: msg }, 400);
  }
});

app.delete("/dishes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const future = await c.env.DB
    .prepare("SELECT date FROM schedule WHERE dish_id = ? AND date >= ? LIMIT 1")
    .bind(id, serverToday())
    .first<{ date: string }>();
  if (future) {
    return c.json({ error: `Dish is scheduled for ${future.date} — unschedule it first` }, 409);
  }
  const [, dishRes] = await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM clues WHERE dish_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM dishes WHERE id = ?").bind(id),
  ]);
  if (dishRes.meta.changes === 0) return c.json({ error: "Dish not found" }, 404);
  return c.json({ ok: true });
});

// Canonical ingredient vocabulary for the tag-input autocomplete.
app.get("/ingredients", async (c) => {
  const res = await c.env.DB.prepare("SELECT ingredients FROM dishes").all<{ ingredients: string }>();
  const all = new Set<string>();
  for (const row of res.results) {
    for (const ing of JSON.parse(row.ingredients) as string[]) all.add(ing);
  }
  return c.json([...all].sort());
});

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

app.get("/schedule", async (c) => {
  const today = serverToday();
  const from = c.req.query("from") ?? addDays(today, -7);
  const to = c.req.query("to") ?? addDays(today, 45);
  if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
    return c.json({ error: "Invalid date range" }, 400);
  }
  const res = await c.env.DB
    .prepare(
      `SELECT s.date, s.dish_id, d.name FROM schedule s JOIN dishes d ON d.id = s.dish_id
       WHERE s.date BETWEEN ? AND ? ORDER BY s.date`,
    )
    .bind(from, to)
    .all<{ date: string; dish_id: number; name: string }>();
  const byDate = new Map(res.results.map((r) => [r.date, r]));
  const entries: ScheduleEntry[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = byDate.get(d);
    entries.push({ date: d, dishId: row?.dish_id ?? null, dishName: row?.name ?? null });
  }
  return c.json(entries);
});

app.put("/schedule", async (c) => {
  let body: { date?: string; dishId?: number | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const today = serverToday();
  if (!body.date || !isValidDateString(body.date)) return c.json({ error: "Invalid date" }, 400);
  if (body.date < today) return c.json({ error: "Past days are locked" }, 400);
  if (body.dishId == null) {
    await c.env.DB.prepare("DELETE FROM schedule WHERE date = ?").bind(body.date).run();
    return c.json({ ok: true });
  }
  const dish = await c.env.DB
    .prepare(
      `SELECT d.id, d.ingredients, (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count
       FROM dishes d WHERE d.id = ?`,
    )
    .bind(body.dishId)
    .first<{ id: number; ingredients: string; clue_count: number }>();
  if (!dish) return c.json({ error: "Dish not found" }, 404);
  if ((JSON.parse(dish.ingredients) as string[]).length < 3 || dish.clue_count !== 5) {
    return c.json({ error: "Dish needs at least 3 ingredients and exactly 5 clues before scheduling" }, 400);
  }
  await c.env.DB
    .prepare("INSERT INTO schedule (date, dish_id) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET dish_id = excluded.dish_id")
    .bind(body.date, body.dishId)
    .run();
  return c.json({ ok: true });
});

// Fill empty days in the next 30 with least-recently-served complete dishes,
// avoiding any dish served or scheduled within 60 days.
app.post("/schedule/autofill", async (c) => {
  const today = serverToday();
  const windowEnd = addDays(today, 29);
  const blockStart = addDays(today, -60);

  const scheduled = await c.env.DB
    .prepare("SELECT date, dish_id FROM schedule WHERE date >= ?")
    .bind(blockStart)
    .all<{ date: string; dish_id: number }>();
  const takenDates = new Set(scheduled.results.filter((r) => r.date >= today).map((r) => r.date));
  const recentlyUsed = new Set(scheduled.results.map((r) => r.dish_id));

  const dishes = await c.env.DB
    .prepare(
      `SELECT d.id, d.ingredients,
         (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count,
         (SELECT MAX(s.date) FROM schedule s WHERE s.dish_id = d.id AND s.date < ?) AS last_served
       FROM dishes d WHERE d.is_active = 1`,
    )
    .bind(today)
    .all<{ id: number; ingredients: string; clue_count: number; last_served: string | null }>();

  const eligible = dishes.results
    .filter(
      (d) =>
        d.clue_count === 5 &&
        (JSON.parse(d.ingredients) as string[]).length >= 3 &&
        !recentlyUsed.has(d.id),
    )
    // Never-served first, then least recently served.
    .sort((a, b) => (a.last_served ?? "").localeCompare(b.last_served ?? ""));

  const statements = [];
  let filled = 0;
  for (let d = today; d <= windowEnd && filled < eligible.length; d = addDays(d, 1)) {
    if (takenDates.has(d)) continue;
    statements.push(
      c.env.DB.prepare("INSERT INTO schedule (date, dish_id) VALUES (?, ?)").bind(d, eligible[filled].id),
    );
    filled++;
  }
  if (statements.length > 0) await c.env.DB.batch(statements);
  return c.json({ filled: statements.length });
});

app.post("/preview", async (c) => {
  let body: { dishId?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const dish = await c.env.DB.prepare("SELECT id FROM dishes WHERE id = ?").bind(Number(body.dishId)).first();
  if (!dish) return c.json({ error: "Dish not found" }, 404);
  const token = await createToken(`preview:${body.dishId}`, PREVIEW_TTL_MS, c.env.SESSION_SECRET);
  return c.json({ token, url: `/?preview=${encodeURIComponent(token)}` });
});

// ---- Player dish requests (review inbox) ----

interface DishRequestDbRow {
  id: number;
  name: string;
  country: string | null;
  note: string | null;
  surface: string;
  created_at: string;
}

app.get("/requests", async (c) => {
  const res = await c.env.DB
    .prepare("SELECT id, name, country, note, surface, created_at FROM dish_requests ORDER BY created_at DESC, id DESC")
    .all<DishRequestDbRow>();
  const requests: DishRequest[] = res.results.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    note: r.note,
    surface: SURFACES.includes(r.surface as never) ? (r.surface as Surface) : "web",
    createdAt: r.created_at,
  }));
  return c.json(requests);
});

app.delete("/requests/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const res = await c.env.DB.prepare("DELETE FROM dish_requests WHERE id = ?").bind(id).run();
  if (res.meta.changes === 0) return c.json({ error: "Request not found" }, 404);
  return c.json({ ok: true });
});

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

app.get("/dashboard", async (c) => {
  const today = serverToday();
  const tomorrow = addDays(today, 1);
  const [todayRes, tomorrowRes, upcomingRes, dishesRes, noticeRes] = await c.env.DB.batch([
    c.env.DB
      .prepare("SELECT s.dish_id, d.name FROM schedule s JOIN dishes d ON d.id = s.dish_id WHERE s.date = ?")
      .bind(today),
    c.env.DB
      .prepare("SELECT s.dish_id, d.name FROM schedule s JOIN dishes d ON d.id = s.dish_id WHERE s.date = ?")
      .bind(tomorrow),
    c.env.DB.prepare("SELECT date FROM schedule WHERE date >= ? AND date <= ?").bind(today, addDays(today, 59)),
    c.env.DB.prepare(
      `SELECT d.id, d.name, d.ingredients,
         (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count
       FROM dishes d WHERE d.is_active = 1`,
    ),
    // Notices that could still be showing: the kill switch is on and the window
    // hasn't closed. That leaves `active` and `upcoming`, which announcementStatus
    // separates below — the route never re-derives the rule itself.
    c.env.DB
      .prepare(
        `SELECT id, header, audience, start_date, end_date FROM announcements
           WHERE is_active = 1 AND end_date >= ? ORDER BY start_date, id`,
      )
      .bind(today),
  ]);
  const todayRow = todayRes.results[0] as { dish_id: number; name: string } | undefined;
  const tomorrowRow = tomorrowRes.results[0] as { dish_id: number; name: string } | undefined;

  const scheduledSet = new Set((upcomingRes.results as { date: string }[]).map((r) => r.date));
  let scheduledAhead = 0;
  let firstGap: string | null = null;
  for (let d = today, i = 0; i < 60; d = addDays(d, 1), i++) {
    if (scheduledSet.has(d)) {
      if (firstGap === null) scheduledAhead++;
    } else if (firstGap === null) {
      firstGap = d;
    }
  }

  const warnings: AdminDashboard["warnings"] = [];
  for (const d of dishesRes.results as { id: number; name: string; ingredients: string; clue_count: number }[]) {
    if (d.clue_count !== 5) {
      warnings.push({ kind: "missing-clues", dishId: d.id, dishName: d.name, detail: `${d.clue_count}/5 clues` });
    }
    const count = (JSON.parse(d.ingredients) as string[]).length;
    if (count < 3) {
      warnings.push({ kind: "few-ingredients", dishId: d.id, dishName: d.name, detail: `${count} ingredients` });
    }
  }

  // Live notices in the same order the game queues them (oldest window first);
  // the rest of this set is booked but not yet open.
  const liveAnnouncements: DashboardAnnouncement[] = [];
  let upcomingAnnouncements = 0;
  for (const r of noticeRes.results as {
    id: number;
    header: string;
    audience: string;
    start_date: string;
    end_date: string;
  }[]) {
    const status = announcementStatus({ startDate: r.start_date, endDate: r.end_date, isActive: true }, today);
    if (status === "upcoming") {
      upcomingAnnouncements++;
      continue;
    }
    liveAnnouncements.push({
      id: r.id,
      header: r.header,
      audience: (ANNOUNCEMENT_AUDIENCES.includes(r.audience as never) ? r.audience : "all") as AnnouncementAudience,
      endDate: r.end_date,
    });
  }

  const dashboard: AdminDashboard = {
    today: { date: today, dishId: todayRow?.dish_id ?? null, dishName: todayRow?.name ?? null },
    tomorrow: { date: tomorrow, dishId: tomorrowRow?.dish_id ?? null, dishName: tomorrowRow?.name ?? null },
    scheduledAhead,
    firstGap,
    liveAnnouncements,
    upcomingAnnouncements,
    warnings,
  };
  return c.json(dashboard);
});

// What the kitchen has actually been serving, by dish attribute (region /
// course / protein / temperature ratios across past Specials, the days booked
// ahead, and the active pool as a baseline). Catalogue data only — no player
// analytics — so it takes no surface/date filters. The fold is pure: see
// worker/menu.ts.
app.get("/menu-mix", async (c) => {
  const [scheduleRes, poolRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT s.date, d.id, d.name, d.country, d.region, d.course, d.temperature, d.protein, d.ingredients
         FROM schedule s JOIN dishes d ON d.id = s.dish_id ORDER BY s.date`,
    ),
    c.env.DB.prepare(
      "SELECT id, name, country, region, course, temperature, protein, ingredients FROM dishes WHERE is_active = 1",
    ),
  ]);
  const mix = assembleMenuMix(
    scheduleRes.results as unknown as MenuScheduleRow[],
    poolRes.results as unknown as MenuDishRow[],
    serverToday(),
  );
  return c.json(mix);
});

const zeroByKind = (): StartedByKind => ({ daily: 0, leftover: 0, random: 0 });

/**
 * Optional surface filter (web / discord) for the analytics reads. Absent or
 * unrecognised → all surfaces. The value is whitelisted against the SURFACES
 * enum, so it's safe to splice the literal straight into the SQL (no bind-param
 * reshuffling across the many queries below). `and` extends an existing WHERE;
 * `where` starts one for the queries that otherwise have none.
 */
function surfaceClause(c: Context): { and: string; where: string } {
  const param = c.req.query("surface");
  const surface = SURFACES.includes(param as never) ? (param as Surface) : null;
  return surface ? { and: ` AND surface = '${surface}'`, where: ` WHERE surface = '${surface}'` } : { and: "", where: "" };
}

// Anonymous engagement aggregates (see migrations/0005_add_analytics.sql and
// 0007_add_analytics_kind.sql). A round is one of three kinds — the daily
// Special, a leftover (archive replay), or a chef's special (random recipe).
app.get("/analytics", async (c) => {
  const today = serverToday();
  // The day slice defaults to today; `?date=` swaps in an earlier ET day so the
  // dashboard can look back. Future dates are ignored (nothing to show) rather
  // than rejected — the panel just falls back to today.
  const asked = c.req.query("date");
  const day = asked && isValidDateString(asked) && asked <= today ? asked : today;

  const { and: surfAnd, where: surfWhere } = surfaceClause(c);

  // started_at is stored in UTC; SQLite has no named-timezone support, so we
  // fold UTC instants into ET days/hours in JS below. Compute the ET-"today"
  // UTC window (and a ~5-week lower bound for the daily series) from the same
  // midnight-ET countdown the rollover uses.
  const nextMidnightUtcMs = Date.now() + msUntilGameMidnight();
  const utcStamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  const dailyLowerBound = utcStamp(nextMidnightUtcMs - 36 * 86_400_000);

  // All-time totals carry a per-kind split of `started` (COUNT(*)).
  const allTimeTotalsSql =
    `SELECT COUNT(*) AS started,
       COALESCE(SUM(completed), 0) AS completed,
       COALESCE(SUM(solved), 0) AS solved,
       COALESCE(SUM(shared), 0) AS shared,
       COALESCE(SUM(completed = 1 AND solved = 0), 0) AS fails,
       COALESCE(SUM(kind = 'daily'), 0) AS started_daily,
       COALESCE(SUM(kind = 'leftover'), 0) AS started_leftover,
       COALESCE(SUM(kind = 'random'), 0) AS started_random
     FROM analytics_rounds${surfWhere}`;
  // The selected day's Special — the daily puzzle only, so replays/random never
  // dilute its completion, win rate, or guess distribution.
  const dayTotalsSql =
    `SELECT COUNT(*) AS started,
       COALESCE(SUM(completed), 0) AS completed,
       COALESCE(SUM(solved), 0) AS solved,
       COALESCE(SUM(shared), 0) AS shared,
       COALESCE(SUM(completed = 1 AND solved = 0), 0) AS fails
     FROM analytics_rounds WHERE play_date = ? AND kind = 'daily'${surfAnd}`;
  const distSql = (where: string) =>
    `SELECT guesses, COUNT(*) AS n FROM analytics_rounds
       WHERE completed = 1 AND solved = 1 AND guesses BETWEEN 1 AND ?${where}${surfAnd}
       GROUP BY guesses`;

  const [
    allTimeTotalsRes,
    allTimeDistRes,
    dayTotalsRes,
    dayDistRes,
    dayDishRes,
    dayKindRes,
    dailyRes,
    hourlyRes,
    playerRes,
    trackingStartRes,
    countryRes,
    solveTimeRes,
    visitRes,
  ] = await c.env.DB.batch([
      c.env.DB.prepare(allTimeTotalsSql),
      c.env.DB.prepare(distSql("")).bind(MAX_GUESSES),
      c.env.DB.prepare(dayTotalsSql).bind(day),
      c.env.DB.prepare(distSql(" AND play_date = ? AND kind = 'daily'")).bind(MAX_GUESSES, day),
      c.env.DB
        .prepare("SELECT d.name FROM schedule s JOIN dishes d ON d.id = s.dish_id WHERE s.date = ?")
        .bind(day),
      // The selected ET day's whole service, bucketed by UTC hour AND kind: the
      // daily series below only reaches back ~5 weeks, so a day picked from
      // further back wouldn't be in it — this asks directly. Widen to a ±1-day
      // UTC window and fold to ET days/hours in JS, since SQLite can't do named
      // timezones. Keeping the hour (rather than collapsing to a day total) is
      // what feeds the overview's hourly-by-mode chart; the completed/solved/
      // shared sums are the started-that-day cohort, so they cover every kind
      // where `dayTotalsSql` above narrows to the Special alone.
      c.env.DB
        .prepare(
          `SELECT strftime('%Y-%m-%d %H', started_at) AS bucket, kind,
             COUNT(*) AS started,
             COALESCE(SUM(completed), 0) AS completed,
             COALESCE(SUM(solved), 0) AS solved,
             COALESCE(SUM(shared), 0) AS shared,
             MAX(started_at) AS last_started
             FROM analytics_rounds
             WHERE started_at IS NOT NULL
               AND started_at >= datetime(?, '-1 day') AND started_at < datetime(?, '+2 days')
               ${surfAnd}
             GROUP BY bucket, kind`,
        )
        .bind(day, day),
      // Daily series: bucket started_at by UTC hour + kind, folded into ET days
      // below. "Games started" is a started-at metric, so a leftover replayed
      // today lands on today — not on the old puzzle's date.
      c.env.DB
        .prepare(
          `SELECT strftime('%Y-%m-%d %H', started_at) AS bucket, kind,
             COUNT(*) AS started,
             COALESCE(SUM(completed), 0) AS completed,
             COALESCE(SUM(solved), 0) AS solved,
             COALESCE(SUM(shared), 0) AS shared
           FROM analytics_rounds
           WHERE started_at IS NOT NULL AND started_at >= ?${surfAnd}
           GROUP BY bucket, kind`,
        )
        .bind(dailyLowerBound),
      c.env.DB.prepare(
        // Started-at is stored in UTC. ET has DST, so we bucket by UTC hour and
        // fold each bucket into its ET hour-of-day (the offset is whole hours).
        `SELECT strftime('%Y-%m-%d %H', started_at) AS bucket, COUNT(*) AS n
           FROM analytics_rounds WHERE started_at IS NOT NULL${surfAnd} GROUP BY bucket`,
      ),
      // New-vs-returning input: one row per (player, active UTC hour). Folded to
      // ET days in JS; a player's earliest ET day is when they were "new", every
      // later active ET day makes them "returning". Rows before player_id shipped
      // (NULL) are excluded — the split is only meaningful going forward.
      //
      // The funnel rides the same grouping rather than paying for a second scan:
      // it needs the same (player, hour) rows, plus what those rounds did. The
      // two timestamps are what make "played again" answerable — the earliest
      // completion and the latest start in the group, compared as fixed-width
      // UTC strings in worker/funnel.ts. `completed_at` only exists from
      // migrations/0011, so pre-0011 completions fall back to `updated_at`, the
      // same fallback the recent-activity feed uses for their event times.
      c.env.DB.prepare(
        `SELECT player_id, strftime('%Y-%m-%d %H', started_at) AS bucket,
           COUNT(*) AS started,
           COALESCE(SUM(completed), 0) AS completed,
           COALESCE(SUM(shared), 0) AS shared,
           MIN(CASE WHEN completed = 1 THEN COALESCE(completed_at, updated_at) END) AS first_completed,
           MAX(started_at) AS last_started
           FROM analytics_rounds
           WHERE player_id IS NOT NULL AND started_at IS NOT NULL${surfAnd}
           GROUP BY player_id, bucket`,
      ),
      // When player tracking switched on, derived from the data rather than
      // hardcoded to the release date. Deliberately NOT surface-filtered: this
      // marks the instrument, not the audience, so the Discord filter mustn't
      // move it (see playersOn() in worker/players.ts).
      c.env.DB.prepare(
        `SELECT MIN(started_at) AS first_tracked FROM analytics_rounds
           WHERE player_id IS NOT NULL AND started_at IS NOT NULL`,
      ),
      // Country mix (migrations/0018). Grouped by (country, player) rather than
      // by country alone: a device that played from two countries must land in
      // exactly one of them or the slices sum to more than the audience, and
      // that choice can't be made in SQL. NULL countries come back too — they're
      // the pre-0018 rows, reported as untracked instead of as a place.
      c.env.DB.prepare(
        `SELECT country, player_id, COUNT(*) AS n
           FROM analytics_rounds WHERE started_at IS NOT NULL${surfAnd}
           GROUP BY country, player_id`,
      ),
      // How long a solved round took, in whole minutes (migrations/0011 gave
      // completions their own timestamp; nothing has read it until now). Grouped
      // rather than returned per row, and folded to a median/p90 in JS — SQLite
      // has no percentile function, and a mean here would follow the one round
      // somebody left open in a background tab all morning.
      c.env.DB.prepare(
        `SELECT CAST((julianday(completed_at) - julianday(started_at)) * 1440 AS INTEGER) AS minutes,
           COUNT(*) AS n
           FROM analytics_rounds
           WHERE solved = 1 AND completed_at IS NOT NULL AND started_at IS NOT NULL${surfAnd}
           GROUP BY minutes`,
      ),
      // The funnel's top (migrations/0020). visit_day is already an ET day —
      // the beacon handler stamps it — so unlike everything else here it needs
      // no UTC-to-ET fold. One row per device per day, so a plain COUNT is the
      // visitor count.
      c.env.DB.prepare(
        `SELECT visit_day, COUNT(*) AS n FROM analytics_visits${surfWhere} GROUP BY visit_day`,
      ),
    ]);

  const emptyTotals = { started: 0, completed: 0, solved: 0, shared: 0, fails: 0 };
  const toPeriod = (
    totalsResult: D1Result,
    distResult: D1Result,
    startedByKind: StartedByKind,
    players: PlayerSplit | null,
  ): AnalyticsPeriod => {
    const row = (totalsResult.results[0] as Record<string, number> | undefined) ?? emptyTotals;
    // Named explicitly rather than rest-spread off the row: the all-time query
    // also selects the per-kind `started_*` columns that `startedByKind` is built
    // from, and a spread quietly shipped those inside `totals` — fields the type
    // never declared and nothing read.
    const totals: AnalyticsPeriod["totals"] = {
      started: row.started ?? 0,
      completed: row.completed ?? 0,
      solved: row.solved ?? 0,
      shared: row.shared ?? 0,
    };
    const guessDistribution = Array.from({ length: MAX_GUESSES }, () => 0);
    for (const r of distResult.results as { guesses: number; n: number }[]) {
      guessDistribution[r.guesses - 1] = r.n;
    }
    return { totals, startedByKind, guessDistribution, fails: row.fails ?? 0, players };
  };

  // New vs returning players — see worker/players.ts for the fold. `playersFor`
  // returns null for any ET day before tracking started, so the dashboard can
  // draw a gap there instead of a line pinned to zero.
  const playerActivity = foldPlayerActivity(playerRes.results as PlayerBucketRow[]);
  const firstTracked = (trackingStartRes.results[0] as { first_tracked: string | null } | undefined)
    ?.first_tracked;
  const playerTrackingStart = firstTracked ? etDayOfUtcStamp(firstTracked) : null;
  const playersFor = (date: string) => playersOn(playerActivity, date, playerTrackingStart);

  const at = (allTimeTotalsRes.results[0] ?? {}) as Record<string, number>;
  const allTimeByKind: StartedByKind = {
    daily: at.started_daily ?? 0,
    leftover: at.started_leftover ?? 0,
    random: at.started_random ?? 0,
  };

  // Fold the started_at buckets into ET days, splitting `started` by kind.
  // Player fields (newPlayers/returningPlayers) are computed separately via
  // playersOn() and merged in when the daily array is built, so they're not part
  // of this per-kind started/completed accumulator.
  type DayAccum = Omit<AnalyticsDay, "date" | "newPlayers" | "returningPlayers">;
  const dayMap = new Map<string, DayAccum>();
  for (const r of dailyRes.results as {
    bucket: string;
    kind: RoundKind;
    started: number;
    completed: number;
    solved: number;
    shared: number;
  }[]) {
    // Rebuild the instant at mid-hour to stay clear of any boundary rounding.
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    const et = gameToday(instant);
    let acc = dayMap.get(et);
    if (!acc) {
      acc = { started: 0, startedByKind: zeroByKind(), completed: 0, solved: 0, shared: 0 };
      dayMap.set(et, acc);
    }
    acc.started += r.started;
    if (r.kind in acc.startedByKind) acc.startedByKind[r.kind] += r.started;
    acc.completed += r.completed;
    acc.solved += r.solved;
    acc.shared += r.shared;
  }
  // Oldest first; keep the most recent 30 ET days that saw activity.
  const daily: AnalyticsDay[] = [...dayMap.keys()]
    .sort()
    .slice(-30)
    .map((date) => {
      const p = playersFor(date);
      return {
        date,
        ...dayMap.get(date)!,
        newPlayers: p?.new ?? null,
        returningPlayers: p?.returning ?? null,
      };
    });

  // The selected day's service, folded out of its own ±1-day window: the hourly
  // profile, the all-kinds totals, and when the last round started.
  const service = foldDayService(dayKindRes.results as DayHourRow[], day);
  const dayByKind = zeroByKind();
  for (const h of service.hourly) {
    for (const k of ROUND_KINDS) dayByKind[k] += h.startedByKind[k];
  }
  // Pace baseline: the same multi-day series the charts use, re-folded into a
  // mean cumulative curve over the days *before* this one.
  const pace = foldPace(dailyRes.results as PaceRow[], day);

  const allTime = toPeriod(
    allTimeTotalsRes,
    allTimeDistRes,
    allTimeByKind,
    playersAllTime(playerActivity, playerTrackingStart),
  );
  const dayPeriod = toPeriod(dayTotalsRes, dayDistRes, dayByKind, playersFor(day));
  const dayDish = dayDishRes.results[0] as { name: string } | undefined;

  // The all-time UTC hour buckets are the busiest row set here, and three
  // separate reads come out of them without a second query: the weekly rhythm
  // (weekday × ET hour, which subsumes the old flat 24-hour array), the growth
  // curve below, and the set of ET days that saw any play — the only days the
  // admin's day picker offers.
  const active = new Set<string>();
  for (const r of hourlyRes.results as { bucket: string; n: number }[]) {
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    active.add(gameToday(instant));
  }

  // Visits by ET day. The first day with a row marks when the beacon switched
  // on; every day before it is *unmeasured*, and reporting those as 0 visitors
  // would claim a 100% bounce rate for the whole of the game's history.
  const visitsByDay = new Map<string, number>();
  for (const r of visitRes.results as { visit_day: string; n: number }[]) {
    visitsByDay.set(r.visit_day, r.n);
  }
  const visitsSince = [...visitsByDay.keys()].sort()[0] ?? null;
  const visitedOn = (date: string): number | null =>
    visitsSince !== null && date >= visitsSince ? (visitsByDay.get(date) ?? 0) : null;
  const visitsAllTime = [...visitsByDay.values()].reduce((a, b) => a + b, 0);

  const summary: AnalyticsSummary = {
    totals: allTime.totals,
    startedByKind: allTime.startedByKind,
    guessDistribution: allTime.guessDistribution,
    fails: allTime.fails,
    players: allTime.players,
    day: {
      date: day,
      dishName: dayDish?.name ?? null,
      ...dayPeriod,
      allKinds: service.allKinds,
      hourly: service.hourly,
      lastStartedAt: service.lastStartedAt,
      pace,
      open: service.open,
      visited: visitedOn(day),
    },
    today,
    activeDates: [...active].sort(),
    daily,
    // All-time growth, folded from the same hour buckets as `hourly`/`activeDates`
    // above — no extra query. It has to come from the all-time rows: `daily`
    // stops ~5 weeks back, which is a window, and growth isn't visible inside one.
    growth: foldGrowth(hourlyRes.results as GrowthRow[], today),
    playerTrackingStart,
    // Repeat visits. Always measured against the *real* today, never the picked
    // day: the return window is "has enough time passed by now", and answering
    // it from a day in the past would call every visit since then a no-show.
    retention: foldRetention(playerActivity, today, playerTrackingStart),
    // Where the rounds came from (GitHub #92) — see worker/countries.ts for why
    // the device-per-country attribution has to happen outside SQL.
    countries: foldCountries(countryRes.results as CountryRow[]),
    // Weekday × hour, off the same all-time buckets as `growth` and `activeDates`
    // — no extra query. Its `byHour` marginal is what used to be the bare
    // `hourly` array; the weekday axis is the cycle that array couldn't show.
    rhythm: foldRhythm(hourlyRes.results as RhythmRow[], today),
    solveTimes: foldSolveTimes(solveTimeRes.results as SolveTimeRow[]),
    visits: { visited: visitsSince === null ? null : visitsAllTime, since: visitsSince },
    // Where players fall out, in devices at every stage — off the same
    // (player, hour) rows as the new-vs-returning fold above, so it costs no
    // extra query. Both endings (shared / played again) are computed here so the
    // panel's toggle is presentation, not a round trip. See worker/funnel.ts.
    funnel: foldFunnel(playerRes.results as FunnelBucketRow[], visitsByDay, day),
  };
  return c.json(summary);
});

// How each dish actually played, as opposed to how often the kitchen served it
// (that's /menu-mix). `analytics_rounds.dish_id` has been stamped on every round
// since migrations/0012 and nothing aggregated it until now, so the catalogue and
// the outcomes had no way to meet. Surface-filtered like the rest of the player
// reads; the fold is pure — see worker/dishstats.ts.
//
// Named "/dish-report" rather than anything containing "analytics" or "stats" for
// the same reason as "/recent-rounds": ad blockers match those paths by shape and
// cancel the request in-browser, which surfaces as a bare NetworkError with
// nothing in the Worker logs.
app.get("/dish-report", async (c) => {
  const { and: surfAnd } = surfaceClause(c);
  const today = serverToday();
  const [roundsRes, metaRes] = await c.env.DB.batch([
    // Grouped by outcome as well as dish so one query covers win rate, the guess
    // histogram, DNF and shares. Cardinality is bounded by dishes × kinds ×
    // outcomes, which stays in the hundreds at any volume this game will see.
    c.env.DB.prepare(
      `SELECT dish_id, kind, completed, solved, shared, guesses, COUNT(*) AS n
         FROM analytics_rounds WHERE started_at IS NOT NULL${surfAnd}
         GROUP BY dish_id, kind, completed, solved, shared, guesses`,
    ),
    // Catalogue detail for naming the rows, plus how often each dish has actually
    // been the Special — a dish's record reads differently when it's one outing
    // than when it's three.
    c.env.DB
      .prepare(
        `SELECT d.id, d.name, d.country, d.region, d.course, d.protein,
           (SELECT COUNT(*) FROM schedule s WHERE s.dish_id = d.id AND s.date <= ?) AS times_served,
           (SELECT MAX(s.date) FROM schedule s WHERE s.dish_id = d.id AND s.date <= ?) AS last_served
           FROM dishes d`,
      )
      .bind(today, today),
  ]);
  return c.json(
    foldDishStats(roundsRes.results as unknown as DishStatRow[], metaRes.results as unknown as DishMetaRow[]),
  );
});

// ---- Experiments: did the thing I shipped do anything? ----
//
// Every other endpoint here answers "what is happening". This one exists to
// answer "did my change work", which needs two things nothing else provided: a
// record of when changes went live (the `experiments` table, migrations/0019),
// and a daily series long enough to look at both sides of one.
//
// The series is **all-time and raw**, and both halves of that are deliberate.
// All-time because `daily` stops ~5 weeks back and an experiment from two months
// ago is exactly the one worth re-reading; raw counts because a rate has to be
// pooled over a whole period, and a pre-divided daily percentage can't be
// re-pooled over a different window. Shipping the whole series once lets the tab
// re-window and re-metric every experiment with no further requests.
//
// Path note: "/experiments" is not on the blocker-bait list (analytics, event,
// track, collect, beacon, telemetry, pixel) that forced /recent-rounds and
// /dish-report to be renamed, and an admin fetch fails loudly anyway — src/admin/
// api.ts turns a cancelled request into an explicit ad-blocker message.

function parseExperiment(body: unknown): { input: ExperimentInput } | { error: string } {
  const b = body as Partial<ExperimentInput> | null;
  if (!b || typeof b !== "object") return { error: "Invalid body" };
  const label = typeof b.label === "string" ? b.label.trim() : "";
  if (!label) return { error: "Give the change a name" };
  if (label.length > EXPERIMENT_LIMITS.label) {
    return { error: `Name must be ${EXPERIMENT_LIMITS.label} characters or fewer` };
  }
  const hypothesis = typeof b.hypothesis === "string" ? b.hypothesis.trim() : "";
  if (hypothesis.length > EXPERIMENT_LIMITS.hypothesis) {
    return { error: `Hypothesis must be ${EXPERIMENT_LIMITS.hypothesis} characters or fewer` };
  }
  if (!EXPERIMENT_METRICS.includes(b.metric as never)) return { error: "Pick a metric to watch" };
  if (typeof b.shippedOn !== "string" || !isValidDateString(b.shippedOn)) {
    return { error: "Ship date must be a real YYYY-MM-DD day" };
  }
  return { input: { label, hypothesis, metric: b.metric as ExperimentMetric, shippedOn: b.shippedOn } };
}

app.get("/experiments", async (c) => {
  const { and: surfAnd, where: surfWhere } = surfaceClause(c);
  const today = serverToday();
  const [rowsRes, hourRes, playerRes, trackingRes, visitRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id, label, hypothesis, metric, shipped_on, created_at
         FROM experiments ORDER BY shipped_on DESC, id DESC`,
    ),
    // Same all-time UTC hour buckets the growth curve and rhythm grid read, but
    // carrying the outcome sums too — a rate metric needs its denominator.
    c.env.DB.prepare(
      `SELECT strftime('%Y-%m-%d %H', started_at) AS bucket,
         COUNT(*) AS started,
         COALESCE(SUM(completed), 0) AS completed,
         COALESCE(SUM(solved), 0) AS solved,
         COALESCE(SUM(shared), 0) AS shared
         FROM analytics_rounds WHERE started_at IS NOT NULL${surfAnd}
         GROUP BY bucket`,
    ),
    c.env.DB.prepare(
      `SELECT player_id, strftime('%Y-%m-%d %H', started_at) AS bucket
         FROM analytics_rounds
         WHERE player_id IS NOT NULL AND started_at IS NOT NULL${surfAnd}
         GROUP BY player_id, bucket`,
    ),
    c.env.DB.prepare(
      `SELECT MIN(started_at) AS first_tracked FROM analytics_rounds
         WHERE player_id IS NOT NULL AND started_at IS NOT NULL`,
    ),
    // visit_day is already an ET day, stamped by the beacon handler.
    c.env.DB.prepare(`SELECT visit_day, COUNT(*) AS n FROM analytics_visits${surfWhere} GROUP BY visit_day`),
  ]);

  const activity = foldPlayerActivity(playerRes.results as PlayerBucketRow[]);
  const firstTracked = (trackingRes.results[0] as { first_tracked: string | null } | undefined)?.first_tracked;
  const trackingStart = firstTracked ? etDayOfUtcStamp(firstTracked) : null;
  const visitsByDay = new Map<string, number>();
  for (const r of visitRes.results as { visit_day: string; n: number }[]) visitsByDay.set(r.visit_day, r.n);
  const visitsSince = [...visitsByDay.keys()].sort()[0] ?? null;

  const experiments: Experiment[] = (
    rowsRes.results as {
      id: number;
      label: string;
      hypothesis: string;
      metric: string;
      shipped_on: string;
      created_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    label: r.label,
    hypothesis: r.hypothesis,
    metric: r.metric as ExperimentMetric,
    shippedOn: r.shipped_on,
    createdAt: r.created_at,
  }));

  const report: ExperimentReport = {
    experiments,
    series: foldExperimentSeries(
      hourRes.results as ExperimentHourRow[],
      today,
      activity,
      trackingStart,
      visitsByDay,
      visitsSince,
    ),
  };
  return c.json(report);
});

app.post("/experiments", async (c) => {
  const parsed = parseExperiment(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const e = parsed.input;
  const res = await c.env.DB.prepare(
    `INSERT INTO experiments (label, hypothesis, metric, shipped_on, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
  )
    .bind(e.label, e.hypothesis, e.metric, e.shippedOn)
    .run();
  return c.json({ id: res.meta.last_row_id });
});

app.put("/experiments/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Change not found" }, 404);
  const parsed = parseExperiment(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const e = parsed.input;
  const res = await c.env.DB.prepare(
    `UPDATE experiments SET label = ?, hypothesis = ?, metric = ?, shipped_on = ?, updated_at = datetime('now')
      WHERE id = ?`,
  )
    .bind(e.label, e.hypothesis, e.metric, e.shippedOn, id)
    .run();
  if (res.meta.changes === 0) return c.json({ error: "Change not found" }, 404);
  return c.json({ id });
});

app.delete("/experiments/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Change not found" }, 404);
  const res = await c.env.DB.prepare("DELETE FROM experiments WHERE id = ?").bind(id).run();
  if (res.meta.changes === 0) return c.json({ error: "Change not found" }, 404);
  return c.json({ ok: true });
});

// Recent activity feed (GitHub #47): the aggregates above tell you *how much*
// changed, this tells you *what just happened*. analytics_rounds is one row per
// round, so the three beacons a round can fire are un-flattened back into
// separate events with a UNION and re-sorted by time.
//
// The path deliberately avoids "analytics/events" — ad blockers ship filter
// rules for that shape (it's what tracking beacons look like), and they killed
// the request in-browser before it ever reached the Worker.
app.get("/recent-rounds", async (c) => {
  const { and: surfAnd } = surfaceClause(c);
  const asked = Number(c.req.query("limit"));
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, ANALYTICS_EVENTS_MAX) : ANALYTICS_EVENTS_PAGE;

  // "Mine" filter: the admin's own device sends its player_id so it can show
  // only its test rounds or drop them from the feed. Unlike `surface` (a
  // whitelisted enum, spliced as a literal) this is free text, so it's a bound
  // param — one bind per UNION branch, in branch order, before the LIMIT.
  const player = c.req.query("player");
  const mode = c.req.query("playerMode");
  const mineAnd =
    player && mode === "only"
      ? " AND player_id = ?"
      : player && mode === "hide"
        ? " AND (player_id IS NULL OR player_id != ?)"
        : "";
  const mineBinds = mineAnd ? [player, player, player] : [];

  // Rows written before migrations/0011 have no completed_at/shared_at — fall
  // back to updated_at (the last beacon's time), then started_at.
  const cols = "round_id, puzzle_number, play_date, kind, surface, player_id, dish_id";
  // Name the dish from the dish_id stored on the round (migrations/0012) — this
  // is the only way a `random` (Chef's Choice) dish, which is never scheduled,
  // can be resolved. Pre-0012 rows have no dish_id, so fall back to the old
  // schedule-by-date join for scheduled kinds (random stays blank for those,
  // exactly as before).
  const res = await c.env.DB.prepare(
    `SELECT e.*, COALESCE(dd.name, CASE WHEN e.kind = 'random' THEN NULL ELSE ds.name END) AS dish_name
       FROM (
         SELECT 'start' AS type, started_at AS at, ${cols}, NULL AS guesses, NULL AS solved
           FROM analytics_rounds WHERE started_at IS NOT NULL${surfAnd}${mineAnd}
         UNION ALL
         SELECT 'complete', COALESCE(completed_at, updated_at, started_at), ${cols}, guesses, solved
           FROM analytics_rounds WHERE completed = 1${surfAnd}${mineAnd}
         UNION ALL
         SELECT 'share', COALESCE(shared_at, updated_at, started_at), ${cols}, NULL, NULL
           FROM analytics_rounds WHERE shared = 1${surfAnd}${mineAnd}
         ORDER BY at DESC, round_id, type
         LIMIT ?
       ) e
       LEFT JOIN dishes dd ON dd.id = e.dish_id
       LEFT JOIN schedule s ON s.date = e.play_date
       LEFT JOIN dishes ds ON ds.id = s.dish_id
      ORDER BY e.at DESC, e.round_id, e.type`,
  )
    .bind(...mineBinds, limit)
    .all();

  const events: AnalyticsEvent[] = (
    res.results as {
      type: AnalyticsEventType;
      at: string;
      round_id: string;
      puzzle_number: number;
      play_date: string;
      kind: RoundKind;
      surface: Surface;
      player_id: string | null;
      dish_name: string | null;
      guesses: number | null;
      solved: number | null;
    }[]
  ).map((r) => ({
    type: r.type,
    // SQLite stores "YYYY-MM-DD HH:MM:SS" in UTC; hand the client a real instant
    // so it can render the time in whatever zone it wants.
    at: `${r.at.replace(" ", "T")}Z`,
    roundId: r.round_id,
    puzzleNumber: r.puzzle_number,
    date: r.play_date,
    kind: r.kind,
    surface: r.surface,
    playerId: r.player_id,
    dishName: r.dish_name,
    guesses: r.guesses ?? null,
    solved: r.solved === null || r.solved === undefined ? null : r.solved === 1,
  }));
  return c.json(events);
});

// ---- This device's own data (review, then delete) ---------------------------
//
// The admin is also a player. Every dev round, every "does the modal still open"
// reload, every board opened and abandoned mid-change lands in the same tables
// the dashboard reads — and at tens of rounds a day, one person testing is a
// visible fraction of every rate on it. The arrivals ledger is the worst of it:
// opening the game and never guessing writes a visit row and nothing else, so a
// morning of looking at the page shows up purely as bounce.
//
// "This device" means exactly what the Activity feed's "mine" filter means — the
// anonymous localStorage player id — so the rows summarised here are the rows
// that filter shows, and reviewing there before deleting here is a real review.
//
// Two routes on one path, deliberately: the GET *is* the confirmation step, and
// sharing the path keeps them from drifting into describing different sets.
//
// Path note: "/device-data" carries none of the blocker-bait words (analytics,
// event, track, collect, beacon, telemetry, pixel) that forced /recent-rounds
// and /dish-report to be renamed.

/** Both routes take the id as `?player=` — free text, so always a bound param. */
function playerParam(c: Context): string | null {
  const player = c.req.query("player")?.trim();
  return player ? player : null;
}

app.get("/device-data", async (c) => {
  const player = playerParam(c);
  if (!player) return c.json({ error: "No device id given" }, 400);

  // Grouped by (kind, surface) rather than aggregated flat: the fold needs the
  // split to zero-fill, and one query is cheaper than four COUNT(*)s.
  const [rounds, visits, views] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT kind, surface, COUNT(*) AS rounds,
              SUM(completed) AS completed, SUM(shared) AS shared,
              MIN(started_at) AS first_at,
              MAX(COALESCE(shared_at, completed_at, updated_at, started_at)) AS last_at
         FROM analytics_rounds WHERE player_id = ?
        GROUP BY kind, surface`,
    ).bind(player),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total, MIN(visit_day) AS first_day, MAX(visit_day) AS last_day
         FROM analytics_visits WHERE player_id = ?`,
    ).bind(player),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM announcement_views WHERE player_id = ?`).bind(player),
  ]);

  const visitRow = (visits.results[0] as DeviceVisitRow | undefined) ?? {
    total: 0,
    first_day: null,
    last_day: null,
  };
  const viewCount = (views.results[0] as { total: number } | undefined)?.total ?? 0;
  return c.json(foldDeviceData(player, rounds.results as unknown as DeviceRoundRow[], visitRow, viewCount));
});

// Irreversible, and prod D1 has no automatic backup — which is why the client
// won't offer this until it has fetched the summary above. The reply reports what
// each table actually lost rather than echoing what was asked for: a wipe that
// matched nothing is a wrong id, and saying "done" would hide that.
app.delete("/device-data", async (c) => {
  const player = playerParam(c);
  if (!player) return c.json({ error: "No device id given" }, 400);

  const [rounds, visits, views] = await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM analytics_rounds WHERE player_id = ?").bind(player),
    c.env.DB.prepare("DELETE FROM analytics_visits WHERE player_id = ?").bind(player),
    c.env.DB.prepare("DELETE FROM announcement_views WHERE player_id = ?").bind(player),
  ]);

  const deleted: DeviceDataDeleted = {
    rounds: rounds.meta.changes ?? 0,
    visits: visits.meta.changes ?? 0,
    noticeViews: views.meta.changes ?? 0,
  };
  return c.json(deleted);
});

export default app;
