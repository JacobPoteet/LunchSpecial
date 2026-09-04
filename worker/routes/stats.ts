// Public engagement stats — aggregate-only, no auth. Powers the README badges
// (via shields.io's "endpoint" schema) and anyone curious about the numbers.
// Never exposes anything the admin analytics does beyond top-line totals.

import { Hono } from "hono";
import { MAX_GUESSES, type PublicBreakdown, type PublicStats } from "../../shared/types";
import type { CountryRow } from "../countries";
import type { FunnelBucketRow } from "../funnel";
import type { GrowthRow } from "../growth";
import {
  assembleBreakdown,
  assemblePublicEngagement,
  buildBadge,
  isBadgeMetric,
  type BreakdownDistRow,
  type BreakdownSurfaceDeviceRow,
  type PublicVisitRow,
} from "../stats";

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
  const [scalarRes, distRes, surfaceDevicesRes, hourRes, funnelRes, visitRes, countryRes] =
    await env.DB.batch([
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM dishes) AS dishes,
         COUNT(*) AS rounds,
         COALESCE(SUM(completed), 0) AS completed,
         COALESCE(SUM(solved), 0) AS solved,
         COALESCE(SUM(shared), 0) AS shared,
         -- Excludes Nightcaps deliberately. A Nightcap is out of four and a
         -- Special is out of six, so averaging them together produces a number
         -- that is not an average of anything. Same reason as the distribution
         -- below. The round/completed/solved totals above DO include them,
         -- because "games played" is a count and counts pool fine.
         COALESCE(AVG(CASE WHEN solved = 1 AND kind != 'nightcap' THEN guesses END), 0) AS avgGuesses,
         COALESCE(SUM(completed = 1 AND solved = 0), 0) AS fails,
         COUNT(DISTINCT player_id) AS devices,
         COALESCE(SUM(kind = 'daily'), 0) AS daily_started,
         COALESCE(SUM(kind = 'daily' AND completed = 1), 0) AS daily_completed,
         COALESCE(SUM(kind = 'leftover'), 0) AS leftover_started,
         COALESCE(SUM(kind = 'leftover' AND completed = 1), 0) AS leftover_completed,
         COALESCE(SUM(kind = 'random'), 0) AS random_started,
         COALESCE(SUM(kind = 'random' AND completed = 1), 0) AS random_completed,
         COALESCE(SUM(kind = 'nightcap'), 0) AS nightcap_started,
         COALESCE(SUM(kind = 'nightcap' AND completed = 1), 0) AS nightcap_completed,
         COALESCE(SUM(surface = 'web'), 0) AS web_rounds,
         COALESCE(SUM(surface = 'discord'), 0) AS discord_rounds
       FROM analytics_rounds`,
    ),
    env.DB
      .prepare(
        // Specials only. A "won in 4" out of six and a "won in 4" out of four
        // are different achievements and this histogram has one x-axis.
        `SELECT guesses, COUNT(*) AS n FROM analytics_rounds
           WHERE completed = 1 AND solved = 1 AND kind != 'nightcap' AND guesses BETWEEN 1 AND ?
           GROUP BY guesses`,
      )
      .bind(MAX_GUESSES),
    env.DB.prepare(
      `SELECT surface, COUNT(DISTINCT player_id) AS devices
         FROM analytics_rounds WHERE player_id IS NOT NULL GROUP BY surface`,
    ),
    // The next three feed the engagement half. All aggregate: hour buckets and
    // per-device day counts, never a round's content. started_at is stored in
    // UTC and ET has DST, so rows come back as UTC hour buckets and are folded
    // to ET days in JS — the same conversion the admin dashboard does, via the
    // same folds, so the two can't drift into disagreeing about a number.
    env.DB.prepare(
      `SELECT strftime('%Y-%m-%d %H', started_at) AS bucket, COUNT(*) AS n
         FROM analytics_rounds WHERE started_at IS NOT NULL GROUP BY bucket`,
    ),
    // One row per (device, active UTC hour) — the funnel's stages and the
    // days-played curve both fold out of this single grouping.
    env.DB.prepare(
      `SELECT player_id, strftime('%Y-%m-%d %H', started_at) AS bucket,
         COUNT(*) AS started,
         COALESCE(SUM(completed), 0) AS completed,
         COALESCE(SUM(shared), 0) AS shared,
         MIN(CASE WHEN completed = 1 THEN COALESCE(completed_at, updated_at) END) AS first_completed,
         MAX(started_at) AS last_started
         FROM analytics_rounds
         WHERE player_id IS NOT NULL AND started_at IS NOT NULL
         GROUP BY player_id, bucket`,
    ),
    // Arrivals — already stamped with their ET day server-side, so no fold.
    env.DB.prepare(
      `SELECT visit_day, COUNT(*) AS visitors FROM analytics_visits GROUP BY visit_day`,
    ),
    // Country mix (migrations/0018), for the reach map. Grouped by
    // (country, player) rather than by country alone for the reason the admin
    // query gives: a device that played from two countries has to land in
    // exactly one of them or the totals exceed the audience, and SQL can't make
    // that choice. NULL countries come back too and are reported as untracked.
    env.DB.prepare(
      `SELECT country, player_id, COUNT(*) AS n
         FROM analytics_rounds WHERE started_at IS NOT NULL
         GROUP BY country, player_id`,
    ),
  ]);

  return {
    ...assembleBreakdown(
      scalarRes.results[0] as Record<string, number> | undefined,
      distRes.results as BreakdownDistRow[],
      surfaceDevicesRes.results as BreakdownSurfaceDeviceRow[],
    ),
    ...assemblePublicEngagement(
      hourRes.results as GrowthRow[],
      funnelRes.results as FunnelBucketRow[],
      visitRes.results as PublicVisitRow[],
      countryRes.results as CountryRow[],
    ),
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
