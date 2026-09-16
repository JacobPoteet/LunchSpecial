// The change log and its before/after verdicts.


// ---- Experiments (did the thing I shipped do anything?) ----

/**
 * The per-day metrics an experiment can be pointed at, in display order.
 *
 * Two families, and the split matters because they're compared with different
 * statistics (see shared/experiment.ts): **counts** are a quantity per day, whose
 * noise is day-to-day variance; **rates** are a proportion of a denominator,
 * whose noise is binomial. Treating a rate as a count would judge it by how much
 * traffic wobbled instead of by how many people it was measured on.
 */
export const EXPERIMENT_METRICS = [
  "visitors",
  "started",
  "playRate",
  "players",
  "newPlayers",
  "finishRate",
  "winRate",
  "shareRate",
] as const;
export type ExperimentMetric = (typeof EXPERIMENT_METRICS)[number];

/** Which metrics are proportions of a denominator rather than a daily quantity. */
export const RATE_METRICS: readonly ExperimentMetric[] = ["playRate", "finishRate", "winRate", "shareRate"];

export const EXPERIMENT_LIMITS = { label: 80, hypothesis: 500 } as const;

/** A deliberate change, with what it was supposed to do. */
export interface Experiment {
  id: number;
  label: string;
  hypothesis: string;
  metric: ExperimentMetric;
  /** ET day it went live. The day itself counts as "after". */
  shippedOn: string;
  createdAt: string;
}

/** What the admin form submits to create or update one. */
export interface ExperimentInput {
  label: string;
  hypothesis: string;
  metric: ExperimentMetric;
  shippedOn: string;
}

/**
 * One ET day of every raw number an experiment comparison might need.
 *
 * Deliberately raw counts, never pre-computed rates: a rate has to be pooled
 * across a whole period (total solved / total completed), and averaging daily
 * percentages instead would weight a 1-of-1 day the same as a 40-of-60 one.
 *
 * Zero-filled across the whole span like `GrowthDay` in analytics.ts, for the same reason —
 * a quiet day inside a comparison window is a real zero and dropping it would
 * shorten the window without saying so.
 */
export interface ExperimentDay {
  date: string;
  started: number;
  completed: number;
  solved: number;
  shared: number;
  /** Distinct devices active that ET day, or null before player tracking existed. */
  players: number | null;
  /** Devices whose first-ever play was that day, or null as above. */
  newPlayers: number | null;
  /**
   * Devices that opened a board that day — the funnel's top, and the denominator
   * of `playRate`. Null before the visit beacon shipped (migrations/0020), which
   * is why an experiment from before then simply can't be read on those metrics
   * rather than being read as a catastrophe.
   */
  visitors: number | null;
}

/** Everything the Experiments tab needs, in one response. */
export interface ExperimentReport {
  experiments: Experiment[];
  /** All-time daily series, oldest first, no gaps — windowed client-side. */
  series: ExperimentDay[];
}
