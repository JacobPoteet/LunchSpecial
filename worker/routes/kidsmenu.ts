// The Kids Menu: POST /api/kids-menu and POST /api/kids-menu/peek.
//
// Both are POSTs because the body carries the board, and because a tracked
// round's first open and each peek are written down. "kids-menu" and "peek"
// stay clear of the words ad blockers match (shared/conventions.test.ts).

import { Hono } from "hono";
import { MENU_PEEKS } from "../../shared/kidsmenu";
import { getDishById } from "../db";
import { isAnalyticsId } from "../guesslog";
import {
  buildMenu,
  loadGuessed,
  loadMenuPool,
  loadPeeked,
  parseGuessed,
  recordPeek,
  servePeek,
  stampOpened,
} from "../kidsmenu";
import { resolveTarget } from "../target";

const app = new Hono<{ Bindings: Env }>();

interface MenuBody {
  date?: string;
  preview?: string;
  random?: string;
  special?: string;
  guessed?: unknown;
  /** Sent only by a tracked round, as on /guess. */
  roundId?: string;
  playerId?: string;
  dishId?: number;
}

/** The board and its menu, or the response that refuses it. */
async function menuFor(env: Env, body: MenuBody) {
  const parsed = parseGuessed(body.guessed);
  if ("error" in parsed) return { error: parsed.error };
  const [target, pool, guessed] = await Promise.all([
    resolveTarget(env, body.date, body.preview, body.random, body.special),
    loadMenuPool(env.DB),
    loadGuessed(env.DB, parsed.guessed),
  ]);
  if ("error" in target) return { error: target.error };
  const menu = buildMenu(pool, guessed, parsed.guessed, target.dish);
  if (!menu) return { error: "That board can't order off the Kids Menu" };
  // Tracked the way a guess is (worker/guesslog.ts): the client names the round
  // only when it is tracked, and a rehearsal target records nothing whatever
  // the client sent.
  const roundId = isAnalyticsId(body.roundId) && !target.rehearsal ? body.roundId : null;
  return { menu, target: target.dish, guessed, roundId };
}

app.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as MenuBody | null;
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);
  const built = await menuFor(c.env, body);
  if ("error" in built) return c.json({ error: built.error }, 400);
  if (built.roundId) c.executionCtx.waitUntil(stampOpened(c.env.DB, built.roundId, built.guessed.length));
  return c.json(built.menu);
});

app.post("/peek", async (c) => {
  if (MENU_PEEKS <= 0) return c.json({ error: "Peeks are off" }, 404);
  const body = (await c.req.json().catch(() => null)) as MenuBody | null;
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);
  const dishId = Number(body.dishId);
  if (!Number.isInteger(dishId)) return c.json({ error: "Unknown dish" }, 400);
  const [built, dish] = await Promise.all([menuFor(c.env, body), getDishById(c.env.DB, dishId)]);
  if ("error" in built) return c.json({ error: built.error }, 400);
  if (!dish) return c.json({ error: "Unknown dish" }, 400);

  // A tracked round is held to the limit here. An untracked one (a preview, a
  // playtest) has nowhere to count, so the client's own tally is the limit.
  const roundId = built.roundId;
  const peeked = roundId ? await loadPeeked(c.env.DB, roundId) : [];
  const served = servePeek(built.menu, dish, built.guessed, built.target, peeked, roundId !== null);
  if (!served.peek) {
    const status = served.verdict === "spent" ? 409 : 400;
    return c.json({ error: served.verdict === "spent" ? "No peeks left" : "Not on this menu", verdict: served.verdict }, status);
  }
  if (roundId && served.verdict === "ok") {
    await recordPeek(c.env.DB, roundId, dish.id, isAnalyticsId(body.playerId) ? body.playerId : null);
  }
  return c.json(served.peek);
});

export default app;
