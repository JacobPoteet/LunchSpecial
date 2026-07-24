// Public engagement stats — aggregate-only, no auth. Powers the README badges
// (via shields.io's "endpoint" schema) and anyone curious about the numbers.
// Never exposes anything the admin analytics does beyond top-line totals.

import { Hono } from "hono";
import { MAX_GUESSES, type PublicBreakdown, type PublicStats } from "../../shared/types";
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

// One consolidated, aggregate-only payload for the public breakdown page's live
// charts: headline totals + distinct devices, guess distribution, out-of-guesses
// count, per-mode started/completed, and per-surface rounds/devices. Semantics
// mirror the admin `/analytics` aggregates (fails = completed and not solved;
// distribution = solved rounds bucketed by guesses) so the two never disagree.
async function loadBreakdown(env: Env): Promise<PublicBreakdown> {
  const [scalarRes, distRes, surfaceDevicesRes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM dishes) AS dishes,
         COUNT(*) AS rounds,
         COALESCE(SUM(completed), 0) AS completed,
         COALESCE(SUM(solved), 0) AS solved,
         COALESCE(SUM(shared), 0) AS shared,
         COALESCE(AVG(CASE WHEN solved = 1 THEN guesses END), 0) AS avgGuesses,
         COALESCE(SUM(completed = 1 AND solved = 0), 0) AS fails,
         COUNT(DISTINCT player_id) AS devices,
         COALESCE(SUM(kind = 'daily'), 0) AS daily_started,
         COALESCE(SUM(kind = 'daily' AND completed = 1), 0) AS daily_completed,
         COALESCE(SUM(kind = 'leftover'), 0) AS leftover_started,
         COALESCE(SUM(kind = 'leftover' AND completed = 1), 0) AS leftover_completed,
         COALESCE(SUM(kind = 'random'), 0) AS random_started,
         COALESCE(SUM(kind = 'random' AND completed = 1), 0) AS random_completed,
         COALESCE(SUM(surface = 'web'), 0) AS web_rounds,
         COALESCE(SUM(surface = 'discord'), 0) AS discord_rounds
       FROM analytics_rounds`,
    ),
    env.DB
      .prepare(
        `SELECT guesses, COUNT(*) AS n FROM analytics_rounds
           WHERE completed = 1 AND solved = 1 AND guesses BETWEEN 1 AND ?
           GROUP BY guesses`,
      )
      .bind(MAX_GUESSES),
    env.DB.prepare(
      `SELECT surface, COUNT(DISTINCT player_id) AS devices
         FROM analytics_rounds WHERE player_id IS NOT NULL GROUP BY surface`,
    ),
  ]);

  const s = (scalarRes.results[0] ?? {}) as Record<string, number>;
  const guessDistribution = Array.from({ length: MAX_GUESSES }, () => 0);
  for (const r of distRes.results as { guesses: number; n: number }[]) {
    guessDistribution[r.guesses - 1] = r.n;
  }
  const surfaceDevices: Record<string, number> = {};
  for (const r of surfaceDevicesRes.results as { surface: string; devices: number }[]) {
    surfaceDevices[r.surface] = r.devices;
  }

  return {
    headline: {
      dishes: s.dishes ?? 0,
      rounds: s.rounds ?? 0,
      completed: s.completed ?? 0,
      solved: s.solved ?? 0,
      shared: s.shared ?? 0,
      avgGuesses: s.avgGuesses ?? 0,
    },
    devices: s.devices ?? 0,
    guessDistribution,
    fails: s.fails ?? 0,
    modes: {
      daily: { started: s.daily_started ?? 0, completed: s.daily_completed ?? 0 },
      leftover: { started: s.leftover_started ?? 0, completed: s.leftover_completed ?? 0 },
      random: { started: s.random_started ?? 0, completed: s.random_completed ?? 0 },
    },
    surfaces: {
      web: { rounds: s.web_rounds ?? 0, devices: surfaceDevices.web ?? 0 },
      discord: { rounds: s.discord_rounds ?? 0, devices: surfaceDevices.discord ?? 0 },
    },
  };
}

// Raw public totals.
app.get("/", async (c) => {
  return c.json(await loadStats(c.env));
});

// Consolidated breakdown payload, edge-cached so page traffic doesn't re-run the
// aggregate scans on every visit — the query runs at most once per TTL per colo,
// regardless of how many people load the breakdown page. Data is "live" within
// the window; brag numbers move slowly enough that ten minutes is invisible.
const BREAKDOWN_TTL_SECONDS = 600;

app.get("/breakdown", async (c) => {
  const cache = caches.default;
  // Stable key independent of query string / headers — this response varies by
  // nothing. Clone before returning: cached responses have immutable headers and
  // the CORS middleware needs to set Access-Control-Allow-Origin on the way out.
  const cacheKey = new Request(new URL("/api/stats/breakdown", new URL(c.req.url).origin).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, hit);

  const res = c.json(await loadBreakdown(c.env));
  res.headers.set("Cache-Control", `public, max-age=${BREAKDOWN_TTL_SECONDS}`);
  c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
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
