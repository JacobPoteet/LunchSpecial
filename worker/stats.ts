// Pure helpers for the public engagement badges. Kept DB-free so they stay
// unit-testable; the route in routes/stats.ts feeds these the raw aggregates.
// Badges render via shields.io's "endpoint" schema, so /api/stats/badge returns
// exactly the shape shields.io expects (schemaVersion/label/message/color).

import { MAX_GUESSES, type PublicBreakdown, type PublicStats } from "../shared/types";

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
): PublicBreakdown {
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
