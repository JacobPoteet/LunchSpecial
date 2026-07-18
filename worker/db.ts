import type { Course, Dish, Protein, Region, Temperature } from "../shared/types";
import type { DishRecord } from "./game";
import { fallbackDishIndex } from "./game";

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

/** The Special for a date: the scheduled dish, or a deterministic fallback pick. */
export async function getTargetDish(db: D1Database, date: string): Promise<Dish | null> {
  const scheduled = await db
    .prepare("SELECT d.* FROM schedule s JOIN dishes d ON d.id = s.dish_id WHERE s.date = ?")
    .bind(date)
    .first<DishDbRow>();
  if (scheduled) return rowToDish(scheduled);

  const pool = await db
    .prepare("SELECT * FROM dishes WHERE is_active = 1 ORDER BY id")
    .all<DishDbRow>();
  if (pool.results.length === 0) return null;
  return rowToDish(pool.results[fallbackDishIndex(date, pool.results.length)]);
}

/**
 * Dev-only (free play): pick a dish from the active pool deterministically from
 * an arbitrary seed string. Same seed → same dish for every request in a game
 * (so /daily, /guess and /reveal agree); a fresh seed → a new random dish.
 */
export async function getSeededDish(db: D1Database, seed: string): Promise<Dish | null> {
  const pool = await db
    .prepare("SELECT * FROM dishes WHERE is_active = 1 ORDER BY id")
    .all<DishDbRow>();
  if (pool.results.length === 0) return null;
  return rowToDish(pool.results[fallbackDishIndex(seed, pool.results.length)]);
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

/** Today's date in UTC as YYYY-MM-DD. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}
