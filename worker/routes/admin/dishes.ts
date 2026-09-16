// /api/admin/dishes and /ingredients: the dish catalogue's CRUD.

import { Hono } from "hono";
import type { AdminDishDetail, AdminDishInput, AdminDishRow } from "../../../shared/types";
import { COURSES, PROTEINS, REGIONS, TEMPERATURES } from "../../../shared/types";

import { rowToDish, serverToday, type DishDbRow } from "../../db";

import { slugify } from "./shared";

const app = new Hono<{ Bindings: Env }>();

interface AdminDishDbRow extends DishDbRow {
  clue_count: number;
  last_served: string | null;
  next_booked: string | null;
  times_served: number;
}

function toAdminRow(row: AdminDishDbRow): AdminDishRow {
  const dish = rowToDish(row);
  return {
    ...dish,
    clueCount: row.clue_count,
    lastServed: row.last_served,
    nextBooked: row.next_booked,
    timesServed: row.times_served,
    schedulable: dish.ingredients.length >= 3 && row.clue_count === 5,
  };
}

app.get("/dishes", async (c) => {
  const today = serverToday();
  const res = await c.env.DB
    .prepare(
      // A future booking is the difference between "available" and "spoken for",
      // so the list needs next_booked as well as last_served — see the shuffle's
      // "never scheduled, past or future" rule in worker/shuffle.ts.
      `SELECT d.*,
         (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count,
         (SELECT MAX(s.date) FROM schedule s WHERE s.dish_id = d.id AND s.date <= ?) AS last_served,
         (SELECT COUNT(*) FROM schedule s WHERE s.dish_id = d.id AND s.date <= ?) AS times_served,
         (SELECT MIN(s.date) FROM schedule s WHERE s.dish_id = d.id AND s.date > ?) AS next_booked
       FROM dishes d ORDER BY d.name`,
    )
    // Bound three times rather than as ?1: every other query in this file uses
    // anonymous placeholders. One `today`, read once, so the three subselects
    // can't disagree across a midnight-ET rollover.
    .bind(today, today, today)
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

export default app;
