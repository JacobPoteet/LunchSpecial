// /api/admin/schedule, /autofill, /shuffle and /preview: the specials board.

import { Hono } from "hono";
import type { Course, Region, ScheduleEntry } from "../../../shared/types";

import { pickUnserved, unservedDishes, type ShuffleDishRow } from "../../shuffle";
import { fillVaried, type Booking, type VarietyCandidate } from "../../variety";
import { createToken, PREVIEW_TTL_MS } from "../../auth";
import { getTargetDish, serverToday } from "../../db";

import { isValidDateString } from "../../game";

import { addDays } from "../../../shared/time";

const app = new Hono<{ Bindings: Env }>();

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

  // Everything already on the board inside the repeat window, WITH the dish's
  // region/course/country: the fill reads what each empty day sits next to
  // (worker/variety.ts), not only which dishes are spoken for.
  const scheduled = await c.env.DB
    .prepare(
      `SELECT s.date, s.dish_id, d.region, d.course, d.country
         FROM schedule s JOIN dishes d ON d.id = s.dish_id
        WHERE s.date >= ?`,
    )
    .bind(blockStart)
    .all<{ date: string; dish_id: number; region: Region; course: Course; country: string }>();
  const takenDates = new Set(scheduled.results.filter((r) => r.date >= today).map((r) => r.date));
  const recentlyUsed = new Set(scheduled.results.map((r) => r.dish_id));
  const bookings: Booking[] = scheduled.results.map((r) => ({
    date: r.date,
    region: r.region,
    course: r.course,
    country: r.country,
  }));

  const dishes = await c.env.DB
    .prepare(
      `SELECT d.id, d.region, d.course, d.country, d.ingredients,
         (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count,
         (SELECT MAX(s.date) FROM schedule s WHERE s.dish_id = d.id AND s.date < ?) AS last_served
       FROM dishes d WHERE d.is_active = 1`,
    )
    .bind(today)
    .all<{
      id: number;
      region: Region;
      course: Course;
      country: string;
      ingredients: string;
      clue_count: number;
      last_served: string | null;
    }>();

  const pool: VarietyCandidate[] = dishes.results
    .filter(
      (d) =>
        d.clue_count === 5 &&
        (JSON.parse(d.ingredients) as string[]).length >= 3 &&
        !recentlyUsed.has(d.id),
    )
    .map((d) => ({ id: d.id, region: d.region, course: d.course, country: d.country, lastServed: d.last_served }));

  const empty: string[] = [];
  for (let d = today; d <= windowEnd; d = addDays(d, 1)) if (!takenDates.has(d)) empty.push(d);

  // Rest tier first, then what the day sits next to, then exact rest. Each
  // booking is fed back so the next empty day sees it.
  const made = fillVaried(pool, bookings, empty);
  const statements = made.map((m) =>
    c.env.DB.prepare("INSERT INTO schedule (date, dish_id) VALUES (?, ?)").bind(m.date, m.id),
  );
  if (statements.length > 0) await c.env.DB.batch(statements);
  return c.json({ filled: statements.length });
});

// Roll a dish that has never been the Special onto one day — the Tomorrow's
// Special card's shuffle. Click it until something appealing turns up, then edit
// that dish; see worker/shuffle.ts for what "never" means and why the pool is
// what it is. Writes the same schedule row PUT /schedule would, so a shuffled
// day is an ordinary booking with nothing special about it afterwards.
app.post("/schedule/shuffle", async (c) => {
  let body: { date?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.date || !isValidDateString(body.date)) return c.json({ error: "Invalid date" }, 400);
  if (body.date < serverToday()) return c.json({ error: "Past days are locked" }, 400);

  const res = await c.env.DB
    .prepare(
      `SELECT d.id, d.name, d.ingredients,
         (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count,
         EXISTS (SELECT 1 FROM schedule s WHERE s.dish_id = d.id) AS ever_scheduled
       FROM dishes d WHERE d.is_active = 1`,
    )
    .all<ShuffleDishRow>();

  const pool = unservedDishes(res.results);
  const pick = pickUnserved(pool, Math.random());
  if (!pick) {
    return c.json(
      { error: "Every schedulable dish has been the Special at some point — nothing left to shuffle" },
      409,
    );
  }
  await c.env.DB
    .prepare("INSERT INTO schedule (date, dish_id) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET dish_id = excluded.dish_id")
    .bind(body.date, pick.id)
    .run();
  // `remaining` counts the pool the roll came from, which still includes the dish
  // just booked — it's what's left to try, not what's left after this one.
  return c.json({ date: body.date, dishId: pick.id, dishName: pick.name, remaining: pool.length });
});

/**
 * A token for an untracked test play (`/?preview=…`, 24h).
 *
 * Two ways to ask. `dishId` names a dish outright — the dish editor and the
 * schedule rows, which are both already looking at one. `date` asks the other
 * question: what would a player be served that day? That resolves through
 * `getTargetDish`, so it follows the schedule row when there is one and the
 * deterministic fallback pick when there isn't — which is the case the
 * dashboard's "Test play" would otherwise have to refuse, on exactly the day
 * you'd most want to see what players are getting.
 *
 * Either way the token is minted against a dish id, so nothing downstream
 * changes: the round is the dish, not the date.
 */
app.post("/preview", async (c) => {
  let body: { dishId?: number; date?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  let dishId: number | null = null;
  if (typeof body.date === "string") {
    const target = await getTargetDish(c.env.DB, body.date);
    dishId = target?.id ?? null;
    if (dishId === null) return c.json({ error: "No dish available for that day" }, 404);
  } else {
    const dish = await c.env.DB.prepare("SELECT id FROM dishes WHERE id = ?").bind(Number(body.dishId)).first();
    if (!dish) return c.json({ error: "Dish not found" }, 404);
    dishId = Number(body.dishId);
  }
  const token = await createToken(`preview:${dishId}`, PREVIEW_TTL_MS, c.env.SESSION_SECRET);
  return c.json({ token, url: `/?preview=${encodeURIComponent(token)}` });
});

export default app;
