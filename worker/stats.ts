// Pure helpers for the public engagement badges. Kept DB-free so they stay
// unit-testable; the route in routes/stats.ts feeds these the raw aggregates.
// Badges render via shields.io's "endpoint" schema, so /api/stats/badge returns
// exactly the shape shields.io expects (schemaVersion/label/message/color).

import { gameToday } from "../shared/time";
import {
  MAX_GUESSES,
  type GameGrowth,
  type PublicBreakdown,
  type PublicFunnel,
  type PublicStats,
} from "../shared/types";
import { foldFunnel, type FunnelBucketRow } from "./funnel";
import { foldGrowth, type GrowthRow } from "./growth";

export const BADGE_METRICS = ["rounds", "solved", "solveRate", "shared"] as const;
export type BadgeMetric = (typeof BADGE_METRICS)[number];

export function isBadgeMetric(v: string): v is BadgeMetric {
  return (BADGE_METRICS as readonly string[]).includes(v);
}

/** Shields.io "endpoint" badge payload. */
export interface ShieldsEndpoint {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
  cacheSeconds: number;
}

/** Compact, badge-friendly counts: 942 → "942", 1234 → "1.2k", 2_500_000 → "2.5M". */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${trim(n / 1000)}k`;
  return `${trim(n / 1_000_000)}M`;
}

/** One decimal, but drop a trailing ".0" (1.0k → 1k). */
function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/** solved / completed as a whole-number percent; 0 when nothing has completed. */
export function solveRate(stats: PublicStats): number {
  return stats.completed > 0 ? Math.round((stats.solved / stats.completed) * 100) : 0;
}

// Diner palette (src/styles/base.css) so the badges match the site.
const MUSTARD = "e8a53a";
const HIT = "2e7d4f";
const CHERRY = "c9354a";

/** Raw row shapes fed by the D1 batch in routes/stats.ts loadBreakdown. */
export type BreakdownScalarRow = Record<string, number> | undefined;
export interface BreakdownDistRow {
  guesses: number;
  n: number;
}
export interface BreakdownSurfaceDeviceRow {
  surface: string;
  devices: number;
}

/**
 * Assemble the public breakdown payload from the three raw aggregate result sets.
 * Pure (no env/DB) so it stays unit-testable; routes/stats.ts runs the batch and
 * hands the rows here. All the `?? 0` defaults, distribution bucketing, and
 * surface mapping live here so an empty table yields a fully-zeroed payload.
 */
export function assembleBreakdown(
  scalarRow: BreakdownScalarRow,
  distRows: BreakdownDistRow[],
  surfaceDeviceRows: BreakdownSurfaceDeviceRow[],
): Omit<PublicBreakdown, keyof PublicEngagement> {
  const s = scalarRow ?? {};
  const guessDistribution = Array.from({ length: MAX_GUESSES }, () => 0);
  for (const r of distRows) {
    guessDistribution[r.guesses - 1] = r.n;
  }
  const surfaceDevices: Record<string, number> = {};
  for (const r of surfaceDeviceRows) {
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

/** One (visit_day, count) row from analytics_visits — already keyed by ET day. */
export interface PublicVisitRow {
  visit_day: string;
  visitors: number;
}

/** The three engagement reads the public breakdown carries beyond the totals. */
export type PublicEngagement = Pick<PublicBreakdown, "funnel" | "daysPlayed" | "growth">;

/**
 * `daysPlayed[i]` = devices active on at least i+1 distinct ET days.
 *
 * Built from the same (player, UTC hour) rows the funnel reads, so it costs no
 * extra query. Folding to ET days here rather than counting distinct dates in
 * SQL is the same correctness point the rest of the codebase makes: a round at
 * 1am UTC belongs to the previous ET day, and SQLite has no named timezones.
 */
function foldDaysPlayed(rows: Iterable<FunnelBucketRow>): number[] {
  const daysByPlayer = new Map<string, Set<string>>();
  for (const r of rows) {
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    let days = daysByPlayer.get(r.player_id);
    if (!days) {
      days = new Set();
      daysByPlayer.set(r.player_id, days);
    }
    days.add(gameToday(instant));
  }

  const counts = [...daysByPlayer.values()].map((d) => d.size);
  const longest = counts.reduce((a, b) => Math.max(a, b), 0);
  // Survival, not a histogram: rung i counts everyone who reached it, so the
  // curve falls monotonically and each bar is a real subset of the one before.
  return Array.from({ length: longest }, (_, i) => counts.filter((n) => n > i).length);
}

/**
 * Assemble the engagement half of the public breakdown.
 *
 * Pure, and deliberately built on the **same folds the admin dashboard runs** —
 * `foldFunnel` and `foldGrowth` — rather than on public-only reimplementations.
 * Two codepaths computing "the funnel" from one table is how a portfolio page
 * ends up quoting a number the dashboard behind it disagrees with.
 *
 * The funnel's in-progress/abandoned split is dropped on the way out: it answers
 * "is the diner still full right now", which is a question about the moment the
 * page happened to be opened, not about the game.
 */
export function assemblePublicEngagement(
  hourRows: GrowthRow[],
  funnelRows: FunnelBucketRow[],
  visitRows: PublicVisitRow[],
  now: Date = new Date(),
): PublicEngagement {
  const today = gameToday(now);
  const visitsByDay = new Map(visitRows.map((r) => [r.visit_day, r.visitors]));
  // foldFunnel also answers for one named day; the public page has no day picker,
  // so only the pooled window is kept.
  const { allTime } = foldFunnel(funnelRows, visitsByDay, today, now);
  const { open: _open, ...pooled } = allTime;

  return {
    // `visited: null` means the beacon wasn't running, and a funnel with no
    // measured top isn't a funnel — the page omits the chart rather than
    // drawing it headless.
    funnel: pooled.visited === null ? null : (pooled satisfies PublicFunnel),
    daysPlayed: foldDaysPlayed(funnelRows),
    growth: foldGrowth(hourRows, today) satisfies GameGrowth,
  };
}

/** Build the shields.io endpoint payload for one metric. */
export function buildBadge(metric: BadgeMetric, stats: PublicStats): ShieldsEndpoint {
  const cacheSeconds = 3600; // brag numbers move slowly; let shields.io cache an hour
  switch (metric) {
    case "solved":
      return { schemaVersion: 1, label: "specials solved", message: formatCount(stats.solved), color: HIT, cacheSeconds };
    case "solveRate":
      return { schemaVersion: 1, label: "solve rate", message: `${solveRate(stats)}%`, color: HIT, cacheSeconds };
    case "shared":
      return { schemaVersion: 1, label: "results shared", message: formatCount(stats.shared), color: CHERRY, cacheSeconds };
    case "rounds":
      return { schemaVersion: 1, label: "rounds played", message: formatCount(stats.rounds), color: MUSTARD, cacheSeconds };
  }
}
