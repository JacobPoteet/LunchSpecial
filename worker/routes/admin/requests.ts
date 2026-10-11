// /api/admin/requests: the player suggestion inbox, dishes and drinks alike.

import { Hono } from "hono";
import type { DishRequest, RequestKind, Surface } from "../../../shared/types";
import { REQUEST_KINDS, SURFACES } from "../../../shared/types";
import { loadServed, serverToday } from "../../db";
import { findServed } from "../../requests";

const app = new Hono<{ Bindings: Env }>();

// ---- Player dish requests (review inbox) ----

interface DishRequestDbRow {
  id: number;
  kind: string;
  name: string;
  country: string | null;
  note: string | null;
  surface: string;
  player_id: string | null;
  created_at: string;
}

app.get("/requests", async (c) => {
  const res = await c.env.DB
    .prepare(
      "SELECT id, kind, name, country, note, surface, player_id, created_at FROM dish_requests ORDER BY created_at DESC, id DESC",
    )
    .all<DishRequestDbRow>();
  const today = serverToday();
  const [servedDishes, servedDrinks] = await Promise.all([loadServed(c.env.DB, "dish"), loadServed(c.env.DB, "drink")]);
  const requests: DishRequest[] = res.results.map((r) => {
    const kind: RequestKind = REQUEST_KINDS.includes(r.kind as never) ? (r.kind as RequestKind) : "dish";
    return {
      id: r.id,
      kind,
      name: r.name,
      country: r.country,
      note: r.note,
      surface: SURFACES.includes(r.surface as never) ? (r.surface as Surface) : "web",
      createdAt: r.created_at,
      playerId: r.player_id,
      servedOn: findServed(r.name, kind === "drink" ? servedDrinks : servedDishes, today)?.date ?? null,
    };
  });
  return c.json(requests);
});

app.delete("/requests/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const res = await c.env.DB.prepare("DELETE FROM dish_requests WHERE id = ?").bind(id).run();
  if (res.meta.changes === 0) return c.json({ error: "Request not found" }, 404);
  return c.json({ ok: true });
});

export default app;
