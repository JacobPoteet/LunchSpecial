// Pure helpers for the public engagement badges. Kept DB-free so they stay
// unit-testable; the route in routes/stats.ts feeds these the raw aggregates.
// Badges render via shields.io's "endpoint" schema, so /api/stats/badge returns
// exactly the shape shields.io expects (schemaVersion/label/message/color).

import type { PublicStats } from "../shared/types";

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
