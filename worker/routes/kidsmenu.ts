// The Kids' Menu: POST /api/kids-menu.
//
// A POST because the body carries the board, and because a tracked round's
// first open is written down. "kids-menu" stays clear of the words ad blockers
// match (shared/conventions.test.ts).

import { Hono } from "hono";
import { isAnalyticsId } from "../guesslog";
import { buildMenu, loadGuessed, loadMenuPool, parseGuessed, stampOpened } from "../kidsmenu";
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
  if (!menu) return { error: "That board can't order off the Kids' Menu" };
  // Tracked the way a guess is (worker/guesslog.ts): the client names the round
  // only when it is tracked, and a rehearsal target records nothing whatever
  // the client sent.
  const roundId = isAnalyticsId(body.roundId) && !target.rehearsal ? body.roundId : null;
  return { menu, guessed, roundId };
}

app.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as MenuBody | null;
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);
  const built = await menuFor(c.env, body);
  if ("error" in built) return c.json({ error: built.error }, 400);
  if (built.roundId) c.executionCtx.waitUntil(stampOpened(c.env.DB, built.roundId, built.guessed.length, built.menu.dishes.length));
  return c.json(built.menu);
});

export default app;
