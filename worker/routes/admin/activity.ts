// /api/admin/recent-rounds and /device-data: the Activity tab's feed, and
// this device's own rows (review, then delete).

import { Hono, type Context } from "hono";
import type {
  ActivityDayTotal,
  ActivityFeed,
  ActivityRound,
  ActivityVisit,
  DeviceDataDeleted,
  RoundKind,
  Surface,
} from "../../../shared/types";
import { ACTIVITY_MAX, ACTIVITY_PAGE } from "../../../shared/types";

import { foldDeviceData, type DeviceRoundRow, type DeviceVisitRow } from "../../device";

import { serverToday } from "../../db";

import { isValidDateString } from "../../game";
import { etDayOfHourBucket, etDayOfUtcStamp } from "../../players";

import { surfaceClause } from "./shared";

const app = new Hono<{ Bindings: Env }>();

const ACTIVITY_COLS =
  `round_id, puzzle_number, play_date, kind, surface, player_id, country, dish_id, drink_id,
   started_at, completed, completed_at, shared, shared_at, guesses, solved,
   COALESCE(shared_at, completed_at, updated_at, started_at) AS last_at`;

interface ActivityRoundRow {
  round_id: string;
  puzzle_number: number;
  play_date: string;
  kind: RoundKind;
  surface: Surface;
  player_id: string | null;
  country: string | null;
  dish_id: number | null;
  dish_name: string | null;
  drink_id: number | null;
  drink_name: string | null;
  started_at: string;
  completed: number;
  completed_at: string | null;
  shared: number;
  shared_at: string | null;
  guesses: number | null;
  solved: number | null;
  last_at: string;
}

/** SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) as a real instant the client can render. */
const instant = (stamp: string): string => `${stamp.replace(" ", "T")}Z`;
const nullableInstant = (stamp: string | null): string | null => (stamp ? instant(stamp) : null);

app.get("/recent-rounds", async (c) => {
  const { and: surfAnd, where: surfWhere } = surfaceClause(c);
  const asked = Number(c.req.query("limit"));
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, ACTIVITY_MAX) : ACTIVITY_PAGE;

  // "Mine" filter: the admin's own device sends its player_id so it can show
  // only its test rounds or drop them from the feed. Unlike `surface` (a
  // whitelisted enum, spliced as a literal) this is free text, so it's a bound
  // param.
  const player = c.req.query("player");
  const mode = c.req.query("playerMode");
  const mineAnd =
    player && mode === "only"
      ? " AND player_id = ?"
      : player && mode === "hide"
        ? " AND (player_id IS NULL OR player_id != ?)"
        : "";
  const mineBind = mineAnd ? [player as string] : [];

  // Day scope: `?date=` pins the feed to one ET day. SQLite has no named
  // timezones, so the query widens to a ±1-day UTC window and the exact ET day is
  // decided in JS below — the same shape the day slice's hourly query uses. The
  // page limit is applied *after* that fold rather than in SQL, since the window
  // is deliberately wider than the day it's asking about.
  const today = serverToday();
  const askedDate = c.req.query("date");
  const day = askedDate && isValidDateString(askedDate) && askedDate <= today ? askedDate : null;
  const dayAnd = day ? " AND started_at >= datetime(?, '-1 day') AND started_at < datetime(?, '+2 days')" : "";
  const dayBinds = day ? [day, day] : [];

  // One row more than asked for, purely to know whether "Show more" has anything
  // left to show. Loosened on a day scope — a single ET day at this game's volume
  // is tens of rounds, and the fold has to see the whole window to decide which
  // of them fall inside the day.
  const sqlLimit = day ? ACTIVITY_MAX * 3 : limit + 1;

  // Name the dish from the dish_id stored on the round (migrations/0012) — the
  // only way a `random` (Chef's Choice) dish, which is never scheduled, can be
  // resolved. Pre-0012 rows have no dish_id, so fall back to the old
  // schedule-by-date join for scheduled kinds (random stays blank for those).
  //
  // **A `nightcap` is excluded from that fallback, and it is not an optimisation.**
  // Its `play_date` holds a LOCAL NIGHT KEY rather than an ET day (migrations/0041),
  // so the join finds whatever lunch Special was booked for the same calendar date
  // and every Nightcap in the feed was named after a dish nobody at the bar played.
  // A drink comes off `drink_id` and the `drinks` table, which is the only place
  // it has ever been recorded.
  const [roundsRes, roundDaysRes, visitDaysRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT e.*,
         COALESCE(dd.name, CASE WHEN e.kind IN ('random', 'nightcap') THEN NULL ELSE ds.name END) AS dish_name,
         dr.name AS drink_name
         FROM (
           SELECT ${ACTIVITY_COLS} FROM analytics_rounds
            WHERE started_at IS NOT NULL${surfAnd}${mineAnd}${dayAnd}
            ORDER BY last_at DESC
            LIMIT ?
         ) e
         LEFT JOIN dishes dd ON dd.id = e.dish_id
         LEFT JOIN drinks dr ON dr.id = e.drink_id
         LEFT JOIN schedule s ON s.date = e.play_date
         LEFT JOIN dishes ds ON ds.id = s.dish_id
        ORDER BY e.last_at DESC, e.round_id`,
    ).bind(...mineBind, ...dayBinds, sqlLimit),
    // Which ET days the picker may open. Same all-time UTC hour buckets the
    // growth curve reads, so it costs a grouped scan and not a row per round.
    c.env.DB.prepare(
      `SELECT DISTINCT strftime('%Y-%m-%d %H', started_at) AS bucket
         FROM analytics_rounds WHERE started_at IS NOT NULL${surfAnd}`,
    ),
    // Arrivals get a vote too: a day where everyone bounced recorded no rounds at
    // all, and that is exactly the day worth being able to open.
    c.env.DB.prepare(`SELECT DISTINCT visit_day FROM analytics_visits${surfWhere}`),
  ]);

  const raw = roundsRes.results as unknown as ActivityRoundRow[];
  let rounds: ActivityRound[] = raw.map((r) => ({
    roundId: r.round_id,
    puzzleNumber: r.puzzle_number,
    date: r.play_date,
    // The ET day it was *played*, which is not `play_date` for any Leftover:
    // replaying July's puzzle in August belongs to August's visit.
    playedDay: etDayOfUtcStamp(r.started_at) ?? r.play_date,
    kind: r.kind,
    surface: r.surface,
    playerId: r.player_id,
    country: r.country,
    dishId: r.dish_id,
    dishName: r.dish_name,
    drinkName: r.drink_name,
    startedAt: instant(r.started_at),
    completed: r.completed === 1,
    // Deliberately not COALESCEd onto updated_at: pre-migrations/0011 rows
    // recorded that a round finished and not when, and inventing the stamp would
    // invent a duration. The flag above still lights the arc's pip.
    completedAt: nullableInstant(r.completed_at),
    shared: r.shared === 1,
    sharedAt: nullableInstant(r.shared_at),
    guesses: r.guesses ?? null,
    solved: r.solved === null || r.solved === undefined ? null : r.solved === 1,
    lastAt: instant(r.last_at),
  }));
  if (day) rounds = rounds.filter((r) => r.playedDay === day);
  const hasMore = rounds.length > limit;
  rounds = rounds.slice(0, limit);

  const activeDays = [
    ...new Set([
      ...(roundDaysRes.results as { bucket: string }[])
        .map((r) => etDayOfHourBucket(r.bucket))
        .filter((d): d is string => d !== null),
      ...(visitDaysRes.results as { visit_day: string }[]).map((r) => r.visit_day),
    ]),
  ].sort();

  const oldest = rounds[rounds.length - 1] ?? null;
  const since = oldest?.startedAt ?? null;
  // Arrivals are fetched by **ET day**, not by instant: a visit is written before
  // the first guess, so anchoring on the oldest round's timestamp would drop the
  // very arrival that round belongs to. The boundary day therefore brings its
  // other arrivals along, which is the point — those are the bounces.
  const sinceDay = day ?? oldest?.playedDay ?? null;

  let visits: ActivityVisit[] = [];
  let dayTotals: ActivityDayTotal[] = [];
  if (sinceDay) {
    const visitAnd = day ? " AND visit_day = ?" : " AND visit_day >= ?";
    const [visitRes, totalsRes] = await c.env.DB.batch([
      c.env.DB.prepare(
        `SELECT visit_day, player_id, surface, country, source, first_seen_at
           FROM analytics_visits WHERE 1 = 1${surfAnd}${mineAnd}${visitAnd}
           ORDER BY first_seen_at DESC LIMIT ?`,
      ).bind(...mineBind, sinceDay, ACTIVITY_MAX * 2),
      // What each device really did on each of those days, beyond this page. A
      // group header that could only count what it can see would report a
      // nine-round evening as three. Bucketed by UTC hour and folded to ET days
      // here, the way every other all-time series in this file is.
      c.env.DB.prepare(
        `SELECT player_id, strftime('%Y-%m-%d %H', started_at) AS bucket,
           COUNT(*) AS rounds,
           COALESCE(SUM(solved), 0) AS solved,
           COALESCE(SUM(shared), 0) AS shared
           FROM analytics_rounds
          WHERE player_id IS NOT NULL AND started_at IS NOT NULL${surfAnd}${mineAnd}
            AND started_at >= datetime(?, '-1 day')
          GROUP BY player_id, bucket`,
      ).bind(...mineBind, sinceDay),
    ]);

    visits = (
      visitRes.results as {
        visit_day: string;
        player_id: string;
        surface: Surface;
        country: string | null;
        source: string | null;
        first_seen_at: string;
      }[]
    ).map((v) => ({
      day: v.visit_day,
      playerId: v.player_id,
      surface: v.surface,
      country: v.country,
      source: v.source,
      firstSeenAt: instant(v.first_seen_at),
    }));

    const totals = new Map<string, ActivityDayTotal>();
    for (const r of totalsRes.results as {
      player_id: string;
      bucket: string;
      rounds: number;
      solved: number;
      shared: number;
    }[]) {
      const et = etDayOfHourBucket(r.bucket);
      if (et === null || et < sinceDay) continue;
      if (day && et !== day) continue;
      const key = `${et}::${r.player_id}`;
      const acc = totals.get(key) ?? { day: et, playerId: r.player_id, rounds: 0, solved: 0, shared: 0 };
      acc.rounds += r.rounds;
      acc.solved += r.solved;
      acc.shared += r.shared;
      totals.set(key, acc);
    }
    dayTotals = [...totals.values()];
  }

  const feed: ActivityFeed = { rounds, visits, dayTotals, since, hasMore, activeDays, today };
  return c.json(feed);
});

// ---- This device's own data (review, then delete) ---------------------------
//
// The admin is also a player. Every dev round, every "does the modal still open"
// reload, every board opened and abandoned mid-change lands in the same tables
// the dashboard reads — and at tens of rounds a day, one person testing is a
// visible fraction of every rate on it. The arrivals ledger is the worst of it:
// opening the game and never guessing writes a visit row and nothing else, so a
// morning of looking at the page shows up purely as bounce.
//
// "This device" means exactly what the Activity feed's "mine" filter means — the
// anonymous localStorage player id — so the rows summarised here are the rows
// that filter shows, and reviewing there before deleting here is a real review.
//
// Two routes on one path, deliberately: the GET *is* the confirmation step, and
// sharing the path keeps them from drifting into describing different sets.
//
// Path note: "/device-data" carries none of the blocker-bait words (analytics,
// event, track, collect, beacon, telemetry, pixel) that forced /recent-rounds
// and /dish-report to be renamed.

/** Both routes take the id as `?player=` — free text, so always a bound param. */
function playerParam(c: Context): string | null {
  const player = c.req.query("player")?.trim();
  return player ? player : null;
}

app.get("/device-data", async (c) => {
  const player = playerParam(c);
  if (!player) return c.json({ error: "No device id given" }, 400);

  // Grouped by (kind, surface) rather than aggregated flat: the fold needs the
  // split to zero-fill, and one query is cheaper than four COUNT(*)s.
  const [rounds, visits, views] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT kind, surface, COUNT(*) AS rounds,
              SUM(completed) AS completed, SUM(shared) AS shared,
              MIN(started_at) AS first_at,
              MAX(COALESCE(shared_at, completed_at, updated_at, started_at)) AS last_at
         FROM analytics_rounds WHERE player_id = ?
        GROUP BY kind, surface`,
    ).bind(player),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total, MIN(visit_day) AS first_day, MAX(visit_day) AS last_day
         FROM analytics_visits WHERE player_id = ?`,
    ).bind(player),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM announcement_views WHERE player_id = ?`).bind(player),
  ]);

  const visitRow = (visits.results[0] as DeviceVisitRow | undefined) ?? {
    total: 0,
    first_day: null,
    last_day: null,
  };
  const viewCount = (views.results[0] as { total: number } | undefined)?.total ?? 0;
  return c.json(foldDeviceData(player, rounds.results as unknown as DeviceRoundRow[], visitRow, viewCount));
});

// Irreversible, and prod D1 has no automatic backup — which is why the client
// won't offer this until it has fetched the summary above. The reply reports what
// each table actually lost rather than echoing what was asked for: a wipe that
// matched nothing is a wrong id, and saying "done" would hide that.
app.delete("/device-data", async (c) => {
  const player = playerParam(c);
  if (!player) return c.json({ error: "No device id given" }, 400);

  const [rounds, visits, views] = await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM analytics_rounds WHERE player_id = ?").bind(player),
    c.env.DB.prepare("DELETE FROM analytics_visits WHERE player_id = ?").bind(player),
    c.env.DB.prepare("DELETE FROM announcement_views WHERE player_id = ?").bind(player),
  ]);

  const deleted: DeviceDataDeleted = {
    rounds: rounds.meta.changes ?? 0,
    visits: visits.meta.changes ?? 0,
    noticeViews: views.meta.changes ?? 0,
  };
  return c.json(deleted);
});

export default app;
