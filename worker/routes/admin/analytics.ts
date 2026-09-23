// /api/admin/dashboard, /menu-mix, /analytics, /audience and /dish-report: the reads
// behind the Today, Menu, Players and Trends tabs. Query here, fold in the
// module beside each, assert on the fold.

import { Hono } from "hono";
import type {
  AdminDashboard,
  AnalyticsDay,
  AnalyticsPeriod,
  AnalyticsSummary,
  AnnouncementAudience,
  DashboardAnnouncement,
  PlayerSplit,
  RoundKind,
  StartedByKind,
} from "../../../shared/types";
import { ANNOUNCEMENT_AUDIENCES, MAX_GUESSES, ROUND_KINDS } from "../../../shared/types";
import { announcementStatus } from "../../announcements";

import {
  foldDayService,
  foldPace,
  foldPlayTime,
  foldSolveTimes,
  type DayHourRow,
  type PaceRow,
  type SolveTimeRow,
} from "../../service";
import { foldGrowth, type GrowthRow } from "../../growth";

import { foldCountries, type CountryRow } from "../../countries";
import { foldSources, type VisitSourceRow } from "../../attribution";

import { foldDishStats, type DishMetaRow, type DishStatRow } from "../../dishstats";

import { foldFunnel, type FunnelBucketRow } from "../../funnel";
import { foldRhythm, type RhythmRow } from "../../rhythm";

import { serverToday } from "../../db";

import { isValidDateString } from "../../game";
import {
  etDayOfUtcStamp,
  foldPlayerActivity,
  foldRetention,
  playersAllTime,
  playersOn,
  type PlayerBucketRow,
} from "../../players";
import { foldAudience, type AudienceRoundRow, type AudienceVisitRow } from "../../audience";
import { assembleMenuMix, type MenuDishRow, type MenuScheduleRow } from "../../menu";
import { addDays, gameToday, msUntilGameMidnight } from "../../../shared/time";

import { surfaceClause } from "./shared";

const app = new Hono<{ Bindings: Env }>();

app.get("/dashboard", async (c) => {
  const today = serverToday();
  const tomorrow = addDays(today, 1);
  const [todayRes, tomorrowRes, upcomingRes, dishesRes, noticeRes, tonightRes] = await c.env.DB.batch([
    c.env.DB
      .prepare("SELECT s.dish_id, d.name FROM schedule s JOIN dishes d ON d.id = s.dish_id WHERE s.date = ?")
      .bind(today),
    c.env.DB
      .prepare("SELECT s.dish_id, d.name FROM schedule s JOIN dishes d ON d.id = s.dish_id WHERE s.date = ?")
      .bind(tomorrow),
    c.env.DB.prepare("SELECT date FROM schedule WHERE date >= ? AND date <= ?").bind(today, addDays(today, 59)),
    c.env.DB.prepare(
      `SELECT d.id, d.name, d.ingredients,
         (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count
       FROM dishes d WHERE d.is_active = 1`,
    ),
    // Notices that could still be showing: the kill switch is on and the window
    // hasn't closed. That leaves `active` and `upcoming`, which announcementStatus
    // separates below — the route never re-derives the rule itself.
    c.env.DB
      .prepare(
        `SELECT id, header, audience, start_date, end_date FROM announcements
           WHERE is_active = 1 AND end_date >= ? ORDER BY start_date, id`,
      )
      .bind(today),
    // Tonight's pour. Keyed on the ET day, which is the admin's own night —
    // see the note on AdminDashboard.tonight.
    c.env.DB
      .prepare("SELECT s.drink_id, d.name FROM drink_schedule s JOIN drinks d ON d.id = s.drink_id WHERE s.night = ?")
      .bind(today),
  ]);
  const todayRow = todayRes.results[0] as { dish_id: number; name: string } | undefined;
  const tomorrowRow = tomorrowRes.results[0] as { dish_id: number; name: string } | undefined;
  const tonightRow = tonightRes.results[0] as { drink_id: number; name: string } | undefined;

  const scheduledSet = new Set((upcomingRes.results as { date: string }[]).map((r) => r.date));
  let scheduledAhead = 0;
  let firstGap: string | null = null;
  for (let d = today, i = 0; i < 60; d = addDays(d, 1), i++) {
    if (scheduledSet.has(d)) {
      if (firstGap === null) scheduledAhead++;
    } else if (firstGap === null) {
      firstGap = d;
    }
  }

  const warnings: AdminDashboard["warnings"] = [];
  for (const d of dishesRes.results as { id: number; name: string; ingredients: string; clue_count: number }[]) {
    if (d.clue_count !== 5) {
      warnings.push({ kind: "missing-clues", dishId: d.id, dishName: d.name, detail: `${d.clue_count}/5 clues` });
    }
    const count = (JSON.parse(d.ingredients) as string[]).length;
    if (count < 3) {
      warnings.push({ kind: "few-ingredients", dishId: d.id, dishName: d.name, detail: `${count} ingredients` });
    }
  }

  // Live notices in the same order the game queues them (oldest window first);
  // the rest of this set is booked but not yet open.
  const liveAnnouncements: DashboardAnnouncement[] = [];
  let upcomingAnnouncements = 0;
  for (const r of noticeRes.results as {
    id: number;
    header: string;
    audience: string;
    start_date: string;
    end_date: string;
  }[]) {
    const status = announcementStatus({ startDate: r.start_date, endDate: r.end_date, isActive: true }, today);
    if (status === "upcoming") {
      upcomingAnnouncements++;
      continue;
    }
    liveAnnouncements.push({
      id: r.id,
      header: r.header,
      audience: (ANNOUNCEMENT_AUDIENCES.includes(r.audience as never) ? r.audience : "all") as AnnouncementAudience,
      endDate: r.end_date,
    });
  }

  const dashboard: AdminDashboard = {
    today: { date: today, dishId: todayRow?.dish_id ?? null, dishName: todayRow?.name ?? null },
    tomorrow: { date: tomorrow, dishId: tomorrowRow?.dish_id ?? null, dishName: tomorrowRow?.name ?? null },
    tonight: { night: today, drinkId: tonightRow?.drink_id ?? null, drinkName: tonightRow?.name ?? null },
    scheduledAhead,
    firstGap,
    liveAnnouncements,
    upcomingAnnouncements,
    warnings,
  };
  return c.json(dashboard);
});

// What the kitchen has actually been serving, by dish attribute (region /
// course / protein / temperature ratios across past Specials, the days booked
// ahead, and the active pool as a baseline). Catalogue data only — no player
// analytics — so it takes no surface/date filters. The fold is pure: see
// worker/menu.ts.
app.get("/menu-mix", async (c) => {
  const [scheduleRes, poolRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT s.date, d.id, d.name, d.country, d.region, d.course, d.temperature, d.protein, d.ingredients
         FROM schedule s JOIN dishes d ON d.id = s.dish_id ORDER BY s.date`,
    ),
    c.env.DB.prepare(
      "SELECT id, name, country, region, course, temperature, protein, ingredients FROM dishes WHERE is_active = 1",
    ),
  ]);
  const mix = assembleMenuMix(
    scheduleRes.results as unknown as MenuScheduleRow[],
    poolRes.results as unknown as MenuDishRow[],
    serverToday(),
  );
  return c.json(mix);
});

const zeroByKind = (): StartedByKind => ({ daily: 0, leftover: 0, random: 0, nightcap: 0 });

// Anonymous engagement aggregates (see migrations/0005_add_analytics.sql and
// 0007_add_analytics_kind.sql). A round is one of three kinds — the daily
// Special, a leftover (archive replay), or a chef's special (random recipe).
app.get("/analytics", async (c) => {
  const today = serverToday();
  // The day slice defaults to today; `?date=` swaps in an earlier ET day so the
  // dashboard can look back. Future dates are ignored (nothing to show) rather
  // than rejected — the panel just falls back to today.
  const asked = c.req.query("date");
  const day = asked && isValidDateString(asked) && asked <= today ? asked : today;

  const { and: surfAnd, where: surfWhere } = surfaceClause(c);

  // started_at is stored in UTC; SQLite has no named-timezone support, so we
  // fold UTC instants into ET days/hours in JS below. Compute the ET-"today"
  // UTC window (and a ~5-week lower bound for the daily series) from the same
  // midnight-ET countdown the rollover uses.
  const nextMidnightUtcMs = Date.now() + msUntilGameMidnight();
  const utcStamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  const dailyLowerBound = utcStamp(nextMidnightUtcMs - 36 * 86_400_000);

  // All-time totals carry a per-kind split of `started` (COUNT(*)).
  const allTimeTotalsSql =
    `SELECT COUNT(*) AS started,
       COALESCE(SUM(completed), 0) AS completed,
       COALESCE(SUM(solved), 0) AS solved,
       COALESCE(SUM(shared), 0) AS shared,
       COALESCE(SUM(completed = 1 AND solved = 0), 0) AS fails,
       COALESCE(SUM(kind = 'daily'), 0) AS started_daily,
       COALESCE(SUM(kind = 'leftover'), 0) AS started_leftover,
       COALESCE(SUM(kind = 'random'), 0) AS started_random,
       COALESCE(SUM(kind = 'nightcap'), 0) AS started_nightcap
     FROM analytics_rounds${surfWhere}`;
  // The selected day's Special — the daily puzzle only, so replays/random never
  // dilute its completion, win rate, or guess distribution.
  const dayTotalsSql =
    `SELECT COUNT(*) AS started,
       COALESCE(SUM(completed), 0) AS completed,
       COALESCE(SUM(solved), 0) AS solved,
       COALESCE(SUM(shared), 0) AS shared,
       COALESCE(SUM(completed = 1 AND solved = 0), 0) AS fails
     FROM analytics_rounds WHERE play_date = ? AND kind = 'daily'${surfAnd}`;
  // Specials only, and that `kind != 'nightcap'` is load-bearing rather than
  // tidy: a Nightcap gives four guesses, so a "won in 4" from the bar and a
  // "won in 4" from the diner are different achievements sharing one x-axis.
  // The bar's own distribution is four wide and lives on the After Dark tab.
  const distSql = (where: string) =>
    `SELECT guesses, COUNT(*) AS n FROM analytics_rounds
       WHERE completed = 1 AND solved = 1 AND kind != 'nightcap' AND guesses BETWEEN 1 AND ?${where}${surfAnd}
       GROUP BY guesses`;

  const [
    allTimeTotalsRes,
    allTimeDistRes,
    dayTotalsRes,
    dayDistRes,
    dayDishRes,
    dayKindRes,
    dailyRes,
    hourlyRes,
    playerRes,
    trackingStartRes,
    countryRes,
    solveTimeRes,
    visitRes,
    sourceRes,
  ] = await c.env.DB.batch([
      c.env.DB.prepare(allTimeTotalsSql),
      c.env.DB.prepare(distSql("")).bind(MAX_GUESSES),
      c.env.DB.prepare(dayTotalsSql).bind(day),
      c.env.DB.prepare(distSql(" AND play_date = ? AND kind = 'daily'")).bind(MAX_GUESSES, day),
      c.env.DB
        .prepare("SELECT d.name FROM schedule s JOIN dishes d ON d.id = s.dish_id WHERE s.date = ?")
        .bind(day),
      // The selected ET day's whole service, bucketed by UTC hour AND kind: the
      // daily series below only reaches back ~5 weeks, so a day picked from
      // further back wouldn't be in it — this asks directly. Widen to a ±1-day
      // UTC window and fold to ET days/hours in JS, since SQLite can't do named
      // timezones. Keeping the hour (rather than collapsing to a day total) is
      // what feeds the overview's hourly-by-mode chart; the completed/solved/
      // shared sums are the started-that-day cohort, so they cover every kind
      // where `dayTotalsSql` above narrows to the Special alone.
      c.env.DB
        .prepare(
          `SELECT strftime('%Y-%m-%d %H', started_at) AS bucket, kind,
             COUNT(*) AS started,
             COALESCE(SUM(completed), 0) AS completed,
             COALESCE(SUM(solved), 0) AS solved,
             COALESCE(SUM(shared), 0) AS shared,
             MAX(started_at) AS last_started
             FROM analytics_rounds
             WHERE started_at IS NOT NULL
               AND started_at >= datetime(?, '-1 day') AND started_at < datetime(?, '+2 days')
               ${surfAnd}
             GROUP BY bucket, kind`,
        )
        .bind(day, day),
      // Daily series: bucket started_at by UTC hour + kind, folded into ET days
      // below. "Games started" is a started-at metric, so a leftover replayed
      // today lands on today — not on the old puzzle's date.
      c.env.DB
        .prepare(
          `SELECT strftime('%Y-%m-%d %H', started_at) AS bucket, kind,
             COUNT(*) AS started,
             COALESCE(SUM(completed), 0) AS completed,
             COALESCE(SUM(solved), 0) AS solved,
             COALESCE(SUM(shared), 0) AS shared
           FROM analytics_rounds
           WHERE started_at IS NOT NULL AND started_at >= ?${surfAnd}
           GROUP BY bucket, kind`,
        )
        .bind(dailyLowerBound),
      c.env.DB.prepare(
        // Started-at is stored in UTC. ET has DST, so we bucket by UTC hour and
        // fold each bucket into its ET hour-of-day (the offset is whole hours).
        `SELECT strftime('%Y-%m-%d %H', started_at) AS bucket, COUNT(*) AS n
           FROM analytics_rounds WHERE started_at IS NOT NULL${surfAnd} GROUP BY bucket`,
      ),
      // New-vs-returning input: one row per (player, active UTC hour). Folded to
      // ET days in JS; a player's earliest ET day is when they were "new", every
      // later active ET day makes them "returning". Rows before player_id shipped
      // (NULL) are excluded — the split is only meaningful going forward.
      //
      // The funnel rides the same grouping rather than paying for a second scan:
      // it needs the same (player, hour) rows, plus what those rounds did. The
      // two timestamps are what make "played again" answerable — the earliest
      // completion and the latest start in the group, compared as fixed-width
      // UTC strings in worker/funnel.ts. `completed_at` only exists from
      // migrations/0011, so pre-0011 completions fall back to `updated_at`, the
      // same fallback the recent-activity feed uses for their event times.
      c.env.DB.prepare(
        `SELECT player_id, strftime('%Y-%m-%d %H', started_at) AS bucket,
           COUNT(*) AS started,
           COALESCE(SUM(completed), 0) AS completed,
           COALESCE(SUM(shared), 0) AS shared,
           MIN(CASE WHEN completed = 1 THEN COALESCE(completed_at, updated_at) END) AS first_completed,
           MAX(started_at) AS last_started
           FROM analytics_rounds
           WHERE player_id IS NOT NULL AND started_at IS NOT NULL${surfAnd}
           GROUP BY player_id, bucket`,
      ),
      // When player tracking switched on, derived from the data rather than
      // hardcoded to the release date. Deliberately NOT surface-filtered: this
      // marks the instrument, not the audience, so the Discord filter mustn't
      // move it (see playersOn() in worker/players.ts).
      c.env.DB.prepare(
        `SELECT MIN(started_at) AS first_tracked FROM analytics_rounds
           WHERE player_id IS NOT NULL AND started_at IS NOT NULL`,
      ),
      // Country mix (migrations/0018). Grouped by (country, player) rather than
      // by country alone: a device that played from two countries must land in
      // exactly one of them or the slices sum to more than the audience, and
      // that choice can't be made in SQL. NULL countries come back too — they're
      // the pre-0018 rows, reported as untracked instead of as a place.
      c.env.DB.prepare(
        `SELECT country, player_id, COUNT(*) AS n
           FROM analytics_rounds WHERE started_at IS NOT NULL${surfAnd}
           GROUP BY country, player_id`,
      ),
      // How long a finished round took, in whole minutes (migrations/0011 gave
      // completions their own timestamp; nothing had read it until the solve-time
      // read). Grouped rather than returned per row, and folded to a median/p90
      // in JS — SQLite has no percentile function, and a mean here would follow
      // the one round somebody left open in a background tab all morning.
      //
      // Every finished round, with `solved` alongside, because two folds read
      // this: the solve-time distribution wants the wins only (a loss isn't a
      // solve), and total play time wants both (six wrong guesses is still time
      // spent playing). One query, since the grouping is the same shape.
      c.env.DB.prepare(
        `SELECT CAST((julianday(completed_at) - julianday(started_at)) * 1440 AS INTEGER) AS minutes,
           solved, COUNT(*) AS n
           FROM analytics_rounds
           WHERE completed = 1 AND completed_at IS NOT NULL AND started_at IS NOT NULL${surfAnd}
           GROUP BY minutes, solved`,
      ),
      // The funnel's top (migrations/0020). visit_day is already an ET day —
      // the beacon handler stamps it — so unlike everything else here it needs
      // no UTC-to-ET fold. One row per device per day, so a plain COUNT is the
      // visitor count.
      c.env.DB.prepare(
        `SELECT visit_day, COUNT(*) AS n FROM analytics_visits${surfWhere} GROUP BY visit_day`,
      ),
      // How the audience arrived (migrations/0024). Ungrouped on purpose: the
      // table is already one row per device per ET day, and the fold needs each
      // device's *earliest* day together with the source recorded on that day —
      // which is a per-device argmin SQL can't express in one pass and this
      // volume doesn't justify a window function for.
      c.env.DB.prepare(
        `SELECT player_id, visit_day, source FROM analytics_visits${surfWhere}`,
      ),
    ]);

  const emptyTotals = { started: 0, completed: 0, solved: 0, shared: 0, fails: 0 };
  const toPeriod = (
    totalsResult: D1Result,
    distResult: D1Result,
    startedByKind: StartedByKind,
    players: PlayerSplit | null,
  ): AnalyticsPeriod => {
    const row = (totalsResult.results[0] as Record<string, number> | undefined) ?? emptyTotals;
    // Named explicitly rather than rest-spread off the row: the all-time query
    // also selects the per-kind `started_*` columns that `startedByKind` is built
    // from, and a spread quietly shipped those inside `totals` — fields the type
    // never declared and nothing read.
    const totals: AnalyticsPeriod["totals"] = {
      started: row.started ?? 0,
      completed: row.completed ?? 0,
      solved: row.solved ?? 0,
      shared: row.shared ?? 0,
    };
    const guessDistribution = Array.from({ length: MAX_GUESSES }, () => 0);
    for (const r of distResult.results as { guesses: number; n: number }[]) {
      guessDistribution[r.guesses - 1] = r.n;
    }
    return { totals, startedByKind, guessDistribution, fails: row.fails ?? 0, players };
  };

  // New vs returning players — see worker/players.ts for the fold. `playersFor`
  // returns null for any ET day before tracking started, so the dashboard can
  // draw a gap there instead of a line pinned to zero.
  const playerActivity = foldPlayerActivity(playerRes.results as PlayerBucketRow[]);
  const firstTracked = (trackingStartRes.results[0] as { first_tracked: string | null } | undefined)
    ?.first_tracked;
  const playerTrackingStart = firstTracked ? etDayOfUtcStamp(firstTracked) : null;
  const playersFor = (date: string) => playersOn(playerActivity, date, playerTrackingStart);

  const at = (allTimeTotalsRes.results[0] ?? {}) as Record<string, number>;
  const allTimeByKind: StartedByKind = {
    daily: at.started_daily ?? 0,
    leftover: at.started_leftover ?? 0,
    random: at.started_random ?? 0,
    nightcap: at.started_nightcap ?? 0,
  };

  // Fold the started_at buckets into ET days, splitting `started` by kind.
  // Player fields (newPlayers/returningPlayers) are computed separately via
  // playersOn() and merged in when the daily array is built, so they're not part
  // of this per-kind started/completed accumulator.
  type DayAccum = Omit<AnalyticsDay, "date" | "newPlayers" | "returningPlayers">;
  const dayMap = new Map<string, DayAccum>();
  for (const r of dailyRes.results as {
    bucket: string;
    kind: RoundKind;
    started: number;
    completed: number;
    solved: number;
    shared: number;
  }[]) {
    // Rebuild the instant at mid-hour to stay clear of any boundary rounding.
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    const et = gameToday(instant);
    let acc = dayMap.get(et);
    if (!acc) {
      acc = { started: 0, startedByKind: zeroByKind(), completed: 0, solved: 0, shared: 0 };
      dayMap.set(et, acc);
    }
    acc.started += r.started;
    if (r.kind in acc.startedByKind) acc.startedByKind[r.kind] += r.started;
    acc.completed += r.completed;
    acc.solved += r.solved;
    acc.shared += r.shared;
  }
  // Oldest first; keep the most recent 30 ET days that saw activity.
  const daily: AnalyticsDay[] = [...dayMap.keys()]
    .sort()
    .slice(-30)
    .map((date) => {
      const p = playersFor(date);
      return {
        date,
        ...dayMap.get(date)!,
        newPlayers: p?.new ?? null,
        returningPlayers: p?.returning ?? null,
      };
    });

  // The selected day's service, folded out of its own ±1-day window: the hourly
  // profile, the all-kinds totals, and when the last round started.
  const service = foldDayService(dayKindRes.results as DayHourRow[], day);
  const dayByKind = zeroByKind();
  for (const h of service.hourly) {
    for (const k of ROUND_KINDS) dayByKind[k] += h.startedByKind[k];
  }
  // Pace baseline: the same multi-day series the charts use, re-folded into a
  // mean cumulative curve over the days *before* this one.
  const pace = foldPace(dailyRes.results as PaceRow[], day);

  const allTime = toPeriod(
    allTimeTotalsRes,
    allTimeDistRes,
    allTimeByKind,
    playersAllTime(playerActivity, playerTrackingStart),
  );
  const dayPeriod = toPeriod(dayTotalsRes, dayDistRes, dayByKind, playersFor(day));
  const dayDish = dayDishRes.results[0] as { name: string } | undefined;

  // The all-time UTC hour buckets are the busiest row set here, and three
  // separate reads come out of them without a second query: the weekly rhythm
  // (weekday × ET hour, which subsumes the old flat 24-hour array), the growth
  // curve below, and the set of ET days that saw any play — the only days the
  // admin's day picker offers.
  const active = new Set<string>();
  for (const r of hourlyRes.results as { bucket: string; n: number }[]) {
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    active.add(gameToday(instant));
  }

  // Visits by ET day. The first day with a row marks when the beacon switched
  // on; every day before it is *unmeasured*, and reporting those as 0 visitors
  // would claim a 100% bounce rate for the whole of the game's history.
  const visitsByDay = new Map<string, number>();
  for (const r of visitRes.results as { visit_day: string; n: number }[]) {
    visitsByDay.set(r.visit_day, r.n);
  }
  const visitsSince = [...visitsByDay.keys()].sort()[0] ?? null;
  const visitedOn = (date: string): number | null =>
    visitsSince !== null && date >= visitsSince ? (visitsByDay.get(date) ?? 0) : null;
  const visitsAllTime = [...visitsByDay.values()].reduce((a, b) => a + b, 0);

  const summary: AnalyticsSummary = {
    totals: allTime.totals,
    startedByKind: allTime.startedByKind,
    guessDistribution: allTime.guessDistribution,
    fails: allTime.fails,
    players: allTime.players,
    day: {
      date: day,
      dishName: dayDish?.name ?? null,
      ...dayPeriod,
      allKinds: service.allKinds,
      hourly: service.hourly,
      lastStartedAt: service.lastStartedAt,
      pace,
      open: service.open,
      visited: visitedOn(day),
    },
    today,
    activeDates: [...active].sort(),
    daily,
    // All-time growth, folded from the same hour buckets as `hourly`/`activeDates`
    // above — no extra query. It has to come from the all-time rows: `daily`
    // stops ~5 weeks back, which is a window, and growth isn't visible inside one.
    growth: foldGrowth(hourlyRes.results as GrowthRow[], today),
    playerTrackingStart,
    // Repeat visits. Always measured against the *real* today, never the picked
    // day: the return window is "has enough time passed by now", and answering
    // it from a day in the past would call every visit since then a no-show.
    retention: foldRetention(playerActivity, today, playerTrackingStart),
    // Where the rounds came from (GitHub #92) — see worker/countries.ts for why
    // the device-per-country attribution has to happen outside SQL.
    countries: foldCountries(countryRes.results as CountryRow[]),
    // How they arrived, and whether they came back (migrations/0024). Folded
    // against the *real* today for the same reason as `retention` above — the
    // return window asks whether enough time has passed by now.
    sources: foldSources(sourceRes.results as VisitSourceRow[], today),
    // Weekday × hour, off the same all-time buckets as `growth` and `activeDates`
    // — no extra query. Its `byHour` marginal is what used to be the bare
    // `hourly` array; the weekday axis is the cycle that array couldn't show.
    rhythm: foldRhythm(hourlyRes.results as RhythmRow[], today),
    solveTimes: foldSolveTimes(solveTimeRes.results as SolveTimeRow[]),
    // Total time at the counter, off those same duration rows — no extra query.
    // Capped per round, because a sum can't shrug off an abandoned tab the way
    // the median above does. See foldPlayTime in worker/service.ts.
    playTime: foldPlayTime(solveTimeRes.results as SolveTimeRow[]),
    visits: { visited: visitsSince === null ? null : visitsAllTime, since: visitsSince },
    // Where players fall out, in devices at every stage — off the same
    // (player, hour) rows as the new-vs-returning fold above, so it costs no
    // extra query. Both endings (shared / played again) are computed here so the
    // panel's toggle is presentation, not a round trip. See worker/funnel.ts.
    funnel: foldFunnel(playerRes.results as FunnelBucketRow[], visitsByDay, day),
  };
  return c.json(summary);
});

// How each dish actually played, as opposed to how often the kitchen served it
// (that's /menu-mix). `analytics_rounds.dish_id` has been stamped on every round
// since migrations/0012 and nothing aggregated it until now, so the catalogue and
// the outcomes had no way to meet. Surface-filtered like the rest of the player
// reads; the fold is pure — see worker/dishstats.ts.
//
// Named "/dish-report" rather than anything containing "analytics" or "stats" for
// the same reason as "/recent-rounds": ad blockers match those paths by shape and
// cancel the request in-browser, which surfaces as a bare NetworkError with
// nothing in the Worker logs.
app.get("/dish-report", async (c) => {
  const { and: surfAnd } = surfaceClause(c);
  const today = serverToday();
  const [roundsRes, metaRes] = await c.env.DB.batch([
    // Grouped by outcome as well as dish so one query covers win rate, the guess
    // histogram, DNF and shares. Cardinality is bounded by dishes × kinds ×
    // outcomes, which stays in the hundreds at any volume this game will see.
    //
    // Nightcaps are excluded outright. A Nightcap has a drink and never a
    // `dish_id`, so every one of them would land in `untracked` — which this
    // panel prints as "rounds that predate dish tracking", a sentence that is
    // false about a round played last night. The bar's own report is on the
    // After Dark tab, off `drink_id`.
    c.env.DB.prepare(
      `SELECT dish_id, kind, completed, solved, shared, guesses, COUNT(*) AS n
         FROM analytics_rounds
        WHERE started_at IS NOT NULL AND kind != 'nightcap'${surfAnd}
         GROUP BY dish_id, kind, completed, solved, shared, guesses`,
    ),
    // Catalogue detail for naming the rows, plus how often each dish has actually
    // been the Special — a dish's record reads differently when it's one outing
    // than when it's three.
    c.env.DB
      .prepare(
        `SELECT d.id, d.name, d.country, d.region, d.course, d.protein,
           (SELECT COUNT(*) FROM schedule s WHERE s.dish_id = d.id AND s.date <= ?) AS times_served,
           (SELECT MAX(s.date) FROM schedule s WHERE s.dish_id = d.id AND s.date <= ?) AS last_served
           FROM dishes d`,
      )
      .bind(today, today),
  ]);
  return c.json(
    foldDishStats(roundsRes.results as unknown as DishStatRow[], metaRes.results as unknown as DishMetaRow[]),
  );
});

// Weekly active devices, the cohort grid and the first-visit funnel. Not
// surface-filtered: the fold returns every surface's slice at once, because the
// KPI row and the first-visit funnel print web and Discord side by side. See
// worker/audience.ts. Named for what it is, and nothing a blocker matches on.
app.get("/audience", async (c) => {
  const [roundsRes, visitsRes, trackingRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT player_id, surface, strftime('%Y-%m-%d %H', started_at) AS bucket,
         COUNT(*) AS started,
         COALESCE(SUM(completed), 0) AS completed,
         COALESCE(SUM(shared), 0) AS shared
         FROM analytics_rounds
         WHERE player_id IS NOT NULL AND started_at IS NOT NULL
         GROUP BY player_id, surface, bucket`,
    ),
    c.env.DB.prepare("SELECT player_id, surface, visit_day FROM analytics_visits"),
    // The same instrument mark /analytics derives, deliberately unfiltered.
    c.env.DB.prepare(
      `SELECT MIN(started_at) AS first_tracked FROM analytics_rounds
         WHERE player_id IS NOT NULL AND started_at IS NOT NULL`,
    ),
  ]);
  const firstTracked = (trackingRes.results[0] as { first_tracked: string | null } | undefined)?.first_tracked;
  return c.json(
    foldAudience(
      roundsRes.results as unknown as AudienceRoundRow[],
      visitsRes.results as unknown as AudienceVisitRow[],
      serverToday(),
      firstTracked ? etDayOfUtcStamp(firstTracked) : null,
    ),
  );
});

export default app;
