// Row mapping and lookups for the back bar. The drinks half of worker/db.ts,
// kept separate for the same reason the tables are: nothing here can be
// accidentally pointed at `dishes`, and nothing in db.ts can be pointed here.

import type { Drink, Profile, Region, Spirit, Temperature } from "../shared/types";
import { fnv1a } from "./game";

export interface DrinkDbRow {
  id: number;
  name: string;
  slug: string;
  country: string;
  region: string;
  spirit: string;
  temperature: string;
  profile: string;
  ingredients: string;
  is_alcoholic: number;
  is_active: number;
  is_fan_submission: number;
}

export function rowToDrink(row: DrinkDbRow): Drink {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    country: row.country,
    region: row.region as Region,
    spirit: row.spirit as Spirit,
    temperature: row.temperature as Temperature,
    profile: row.profile as Profile,
    ingredients: JSON.parse(row.ingredients) as string[],
    isAlcoholic: row.is_alcoholic === 1,
    isActive: row.is_active === 1,
    isFanSubmission: row.is_fan_submission === 1,
  };
}

export async function getDrinkById(db: D1Database, id: number): Promise<Drink | null> {
  const row = await db.prepare("SELECT * FROM drinks WHERE id = ?").bind(id).first<DrinkDbRow>();
  return row ? rowToDrink(row) : null;
}

/** A drink by slug — how `npm run negroni` pins a night to one named pour. */
export async function getDrinkBySlug(db: D1Database, slug: string): Promise<Drink | null> {
  const row = await db.prepare("SELECT * FROM drinks WHERE slug = ?").bind(slug).first<DrinkDbRow>();
  return row ? rowToDrink(row) : null;
}

/**
 * Deterministic pick from the active pool, resolved in SQL so one row crosses
 * the wire instead of the whole bar. Must stay equivalent across /info, /guess
 * and /reveal for a given seed, or a round would change drink mid-play.
 */
async function pickActiveDrink(db: D1Database, seed: string): Promise<Drink | null> {
  const row = await db
    .prepare(
      `SELECT * FROM drinks WHERE is_active = 1 ORDER BY id
       LIMIT 1 OFFSET (? % MAX(1, (SELECT COUNT(*) FROM drinks WHERE is_active = 1)))`,
    )
    .bind(fnv1a(seed))
    .first<DrinkDbRow>();
  return row ? rowToDrink(row) : null;
}

/**
 * Tonight's pour: the booked drink, or a deterministic fallback.
 *
 * An unbooked night is a booking decision and not a hole, exactly as an
 * unbooked day is for lunch. The bar never 404s.
 */
export async function getTargetDrink(db: D1Database, night: string): Promise<Drink | null> {
  const booked = await db
    .prepare("SELECT d.* FROM drink_schedule s JOIN drinks d ON d.id = s.drink_id WHERE s.night = ?")
    .bind(night)
    .first<DrinkDbRow>();
  if (booked) return rowToDrink(booked);
  // Seeded off the night with a prefix, so an unbooked night and the lunch date
  // that shares its string never resolve to the same index in two pools.
  return pickActiveDrink(db, `night:${night}`);
}

export async function getCoasters(db: D1Database, drinkId: number): Promise<string[]> {
  const res = await db
    .prepare("SELECT text FROM drink_clues WHERE drink_id = ? ORDER BY order_index")
    .bind(drinkId)
    .all<{ text: string }>();
  return res.results.map((r) => r.text);
}
