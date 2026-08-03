import type { Course, Dish, Protein, Region, Temperature } from "../shared/types";
import { gameToday } from "../shared/time";
import type { DishRecord } from "./game";
import { fnv1a } from "./game";

export interface DishDbRow {
  id: number;
  name: string;
  slug: string;
  country: string;
  region: string;
  course: string;
  temperature: string;
  protein: string;
  ingredients: string;
  is_active: number;
}

export function rowToDish(row: DishDbRow): Dish {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    country: row.country,
    region: row.region as Region,
    course: row.course as Course,
    temperature: row.temperature as Temperature,
    protein: row.protein as Protein,
    ingredients: JSON.parse(row.ingredients) as string[],
    isActive: row.is_active === 1,
  };
}

export async function getDishById(db: D1Database, id: number): Promise<Dish | null> {
  const row = await db.prepare("SELECT * FROM dishes WHERE id = ?").bind(id).first<DishDbRow>();
  return row ? rowToDish(row) : null;
}

/**
 * A dish by slug — how playtesting (`?special=<slug>`, e.g. `npm run ramen`)
 * pins a round to one named dish instead of rolling for it.
 */
export async function getDishBySlug(db: D1Database, slug: string): Promise<Dish | null> {
  const row = await db.prepare("SELECT * FROM dishes WHERE slug = ?").bind(slug).first<DishDbRow>();
  return row ? rowToDish(row) : null;
}

/**
 * Deterministic pick from the active pool: fnv1a(seed) mod the pool size,
 * resolved in SQL so one row crosses the wire instead of the whole pool.
 * Must stay equivalent to indexing the id-ordered pool at fallbackDishIndex
 * (same seed → same dish across /daily, /guess and /reveal).
 */
async function pickActiveDish(db: D1Database, seed: string): Promise<Dish | null> {
  const row = await db
    .prepare(
      `SELECT * FROM dishes WHERE is_active = 1 ORDER BY id
       LIMIT 1 OFFSET (? % MAX(1, (SELECT COUNT(*) FROM dishes WHERE is_active = 1)))`,
    )
    .bind(fnv1a(seed))
    .first<DishDbRow>();
  return row ? rowToDish(row) : null;
}

/** The Special for a date: the scheduled dish, or a deterministic fallback pick. */
export async function getTargetDish(db: D1Database, date: string): Promise<Dish | null> {
  const scheduled = await db
    .prepare("SELECT d.* FROM schedule s JOIN dishes d ON d.id = s.dish_id WHERE s.date = ?")
    .bind(date)
    .first<DishDbRow>();
  if (scheduled) return rowToDish(scheduled);
  return pickActiveDish(db, date);
}

/**
 * Free play ("random recipe"): pick a dish from the active pool
 * deterministically from an arbitrary seed string. Same seed → same dish for
 * every request in a game; a fresh seed → a new random dish.
 */
export async function getSeededDish(db: D1Database, seed: string): Promise<Dish | null> {
  return pickActiveDish(db, seed);
}

export function toRecord(dish: Dish): DishRecord {
  return dish;
}

export async function getClues(db: D1Database, dishId: number): Promise<string[]> {
  const res = await db
    .prepare("SELECT text FROM clues WHERE dish_id = ? ORDER BY order_index")
    .bind(dishId)
    .all<{ text: string }>();
  return res.results.map((r) => r.text);
}

/** The Special's current date (YYYY-MM-DD) — rolls over at midnight ET. */
export function serverToday(): string {
  return gameToday();
}
