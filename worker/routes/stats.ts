// Public engagement stats — aggregate-only, no auth. Powers the README badges
// (via shields.io's "endpoint" schema) and anyone curious about the numbers.
// Never exposes anything the admin analytics does beyond top-line totals.

import { Hono } from "hono";
import type { PublicStats } from "../../shared/types";
import { buildBadge, isBadgeMetric } from "../stats";

const app = new Hono<{ Bindings: Env }>();

async function loadStats(env: Env): Promise<PublicStats> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS rounds,
       COALESCE(SUM(completed), 0) AS completed,
       COALESCE(SUM(solved), 0) AS solved,
       COALESCE(SUM(shared), 0) AS shared
     FROM analytics_rounds`,
  ).first<PublicStats>();
  return row ?? { rounds: 0, completed: 0, solved: 0, shared: 0 };
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
