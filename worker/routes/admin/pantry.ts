// /api/admin/pantry: every active dish's and drink's ingredient list, for the
// ingredient-family panel on the Menu tab.
//
// Catalogue data, no player data. The one thing it does not hand over is the
// NAME of anything booked for a day after today (null instead): the panel's
// picture and its yellow rate need the ingredients, never which dish they
// belong to, and a name that never leaves the Worker is a name that cannot
// surface in a pair picker. Today's Special is not hidden; the dashboard's own
// Today tab already prints it.

import { Hono } from "hono";
import type { Pantry, PantryRow } from "../../../shared/types";
import { serverToday } from "../../db";

const app = new Hono<{ Bindings: Env }>();

interface Row {
  id: number;
  name: string;
  ingredients: string;
}

function fold(rows: Row[], booked: Set<number>): PantryRow[] {
  return rows.map((r) => ({
    name: booked.has(r.id) ? null : r.name,
    ingredients: JSON.parse(r.ingredients) as string[],
  }));
}

app.get("/pantry", async (c) => {
  const today = serverToday();
  const [dishes, drinks, dishBooked, drinkBooked] = await c.env.DB.batch<Record<string, number | string>>([
    c.env.DB.prepare("SELECT id, name, ingredients FROM dishes WHERE is_active = 1 ORDER BY name"),
    c.env.DB.prepare("SELECT id, name, ingredients FROM drinks WHERE is_active = 1 ORDER BY name"),
    c.env.DB.prepare("SELECT DISTINCT dish_id AS id FROM schedule WHERE date > ?").bind(today),
    c.env.DB.prepare("SELECT DISTINCT drink_id AS id FROM drink_schedule WHERE night > ?").bind(today),
  ]);
  const ids = (r: D1Result<Record<string, number | string>>) => new Set((r.results ?? []).map((x) => Number(x.id)));
  const body: Pantry = {
    kitchen: fold((dishes.results ?? []) as unknown as Row[], ids(dishBooked)),
    bar: fold((drinks.results ?? []) as unknown as Row[], ids(drinkBooked)),
  };
  return c.json(body);
});

export default app;
