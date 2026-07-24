// Public engagement stats — aggregate-only, no auth. Powers the README badges
// (via shields.io's "endpoint" schema) and anyone curious about the numbers.
// Never exposes anything the admin analytics does beyond top-line totals.

import { Hono } from "hono";
import type { PublicStats } from "../../shared/types";
import { buildBadge, isBadgeMetric } from "../stats";

const app = new Hono<{ Bindings: Env }>();

// The public project-breakdown page (GitHub Pages) fetches these totals from the
// browser, cross-origin, so the aggregate endpoints are readable from anywhere.
// Aggregate-only data — no per-player or guess content is ever exposed here.
app.use("*", async (c, next) => {
  await next();
  c.header("Access-Control-Allow-Origin", "*");
});

async function loadStats(env: Env): Promise<PublicStats> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM dishes) AS dishes,
       COUNT(*) AS rounds,
       COALESCE(SUM(completed), 0) AS completed,
       COALESCE(SUM(solved), 0) AS solved,
       COALESCE(SUM(shared), 0) AS shared,
       COALESCE(AVG(CASE WHEN solved = 1 THEN guesses END), 0) AS avgGuesses
     FROM analytics_rounds`,
  ).first<PublicStats>();
  return row ?? { rounds: 0, completed: 0, solved: 0, shared: 0, dishes: 0, avgGuesses: 0 };
}

// Raw public totals.
app.get("/", async (c) => {
  return c.json(await loadStats(c.env));
});

// shields.io endpoint badge. ?metric=rounds|solved|solveRate|shared (default rounds).
app.get("/badge", async (c) => {
  const metricParam = c.req.query("metric") ?? "rounds";
  if (!isBadgeMetric(metricParam)) {
    return c.json({ error: "Unknown metric" }, 400);
  }
  return c.json(buildBadge(metricParam, await loadStats(c.env)));
});

export default app;
