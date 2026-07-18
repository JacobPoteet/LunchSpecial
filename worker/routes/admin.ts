import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type {
  AdminDashboard,
  AdminDishDetail,
  AdminDishInput,
  AdminDishRow,
  AnalyticsSummary,
  ScheduleEntry,
} from "../../shared/types";
import { COURSES, MAX_GUESSES, PROTEINS, REGIONS, TEMPERATURES } from "../../shared/types";
import {
  createToken,
  passwordMatches,
  PREVIEW_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  verifyToken,
} from "../auth";
import { getClues, rowToDish, utcToday, type DishDbRow } from "../db";
import { isValidDateString } from "../game";

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
    .bind(utcToday())
    .all<AdminDishDbRow>();
  return c.json(res.results.map(toAdminRow));
});

app.get("/dishes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM dishes WHERE id = ?").bind(id).first<DishDbRow>();
  if (!row) return c.json({ error: "Dish not found" }, 404);
  const detail: AdminDishDetail = { ...rowToDish(row), clues: await getClues(c.env.DB, id) };
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
        `INSERT INTO dishes (name, slug, country, region, course, temperature, protein, ingredients, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
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
           protein = ?, ingredients = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`,
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
    .bind(id, utcToday())
    .first<{ date: string }>();
  if (future) {
    return c.json({ error: `Dish is scheduled for ${future.date} — unschedule it first` }, 409);
  }
  await c.env.DB.prepare("DELETE FROM clues WHERE dish_id = ?").bind(id).run();
  const res = await c.env.DB.prepare("DELETE FROM dishes WHERE id = ?").bind(id).run();
  if (res.meta.changes === 0) return c.json({ error: "Dish not found" }, 404);
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
  const today = utcToday();
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
  const today = utcToday();
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
  const today = utcToday();
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

app.get("/dashboard", async (c) => {
  const today = utcToday();
  const todayRow = await c.env.DB
    .prepare("SELECT s.dish_id, d.name FROM schedule s JOIN dishes d ON d.id = s.dish_id WHERE s.date = ?")
    .bind(today)
    .first<{ dish_id: number; name: string }>();

  const upcoming = await c.env.DB
    .prepare("SELECT date FROM schedule WHERE date >= ? AND date <= ?")
    .bind(today, addDays(today, 59))
    .all<{ date: string }>();
  const scheduledSet = new Set(upcoming.results.map((r) => r.date));
  let scheduledAhead = 0;
  let firstGap: string | null = null;
  for (let d = today, i = 0; i < 60; d = addDays(d, 1), i++) {
    if (scheduledSet.has(d)) {
      if (firstGap === null) scheduledAhead++;
    } else if (firstGap === null) {
      firstGap = d;
    }
  }

  const dishes = await c.env.DB
    .prepare(
      `SELECT d.id, d.name, d.ingredients,
         (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count
       FROM dishes d WHERE d.is_active = 1`,
    )
    .all<{ id: number; name: string; ingredients: string; clue_count: number }>();
  const warnings: AdminDashboard["warnings"] = [];
  for (const d of dishes.results) {
    if (d.clue_count !== 5) {
      warnings.push({ kind: "missing-clues", dishId: d.id, dishName: d.name, detail: `${d.clue_count}/5 clues` });
    }
    const count = (JSON.parse(d.ingredients) as string[]).length;
    if (count < 3) {
      warnings.push({ kind: "few-ingredients", dishId: d.id, dishName: d.name, detail: `${count} ingredients` });
    }
  }

  const dashboard: AdminDashboard = {
    today: { date: today, dishId: todayRow?.dish_id ?? null, dishName: todayRow?.name ?? null },
    scheduledAhead,
    firstGap,
    warnings,
  };
  return c.json(dashboard);
});

// Anonymous engagement aggregates (see migrations/0002_add_analytics.sql).
app.get("/analytics", async (c) => {
  const totals =
    (await c.env.DB.prepare(
      `SELECT COUNT(*) AS started,
         COALESCE(SUM(completed), 0) AS completed,
         COALESCE(SUM(solved), 0) AS solved,
         COALESCE(SUM(shared), 0) AS shared
       FROM analytics_rounds`,
    ).first<AnalyticsSummary["totals"]>()) ?? { started: 0, completed: 0, solved: 0, shared: 0 };

  const distRows = await c.env.DB.prepare(
    `SELECT guesses, COUNT(*) AS n FROM analytics_rounds
       WHERE completed = 1 AND solved = 1 AND guesses BETWEEN 1 AND ?
       GROUP BY guesses`,
  )
    .bind(MAX_GUESSES)
    .all<{ guesses: number; n: number }>();
  const guessDistribution = Array.from({ length: MAX_GUESSES }, () => 0);
  for (const r of distRows.results) guessDistribution[r.guesses - 1] = r.n;

  const failRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS fails FROM analytics_rounds WHERE completed = 1 AND solved = 0",
  ).first<{ fails: number }>();

  const daily = await c.env.DB.prepare(
    `SELECT play_date AS date, COUNT(*) AS started,
       COALESCE(SUM(completed), 0) AS completed,
       COALESCE(SUM(solved), 0) AS solved,
       COALESCE(SUM(shared), 0) AS shared
     FROM analytics_rounds GROUP BY play_date ORDER BY play_date DESC LIMIT 30`,
  ).all<AnalyticsSummary["daily"][number]>();

  const summary: AnalyticsSummary = {
    totals,
    guessDistribution,
    fails: failRow?.fails ?? 0,
    daily: daily.results.reverse(),
  };
  return c.json(summary);
});

export default app;
