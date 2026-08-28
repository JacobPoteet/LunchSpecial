// The activity feed's fold: raw beacon rows in, a readable service log out.
//
// The admin's Activity tab used to be a flat list of beacons — up to three rows
// per game, interleaved with everyone else's — and reading "what did this person
// do" meant scanning an eight-character device id down a column. Every level of
// structure it was missing already existed in the data:
//
//   visit (one device, one ET day)  →  round (one game)  →  beacon (start/complete/share)
//
// The middle level is the one the feed shows. The top level is deliberately
// **the visit and not an invented "session"**: a device × ET day is already what
// `analytics_visits` stores, what `foldRetention` counts as a repeat, and what
// the player funnel's first rung means. Inventing a gap threshold ("rounds
// within 30 minutes") would have given the Activity tab a word the rest of the
// dashboard already uses for something slightly different, with nothing saying
// so. The cost is real and stated in the UI rather than hidden: a device that
// played at breakfast and again at midnight is *one* visit spanning fifteen
// hours, so a group prints its span.
//
// Everything here is pure and unit-tested (activity.test.ts) — the durations,
// the walked-out cutoff and the grouping are all claims the dashboard makes out
// loud, and none of them should only be checkable by looking at prod.

import type {
  ActivityDayTotal,
  ActivityFeed,
  ActivityRound,
  ActivityVisit,
  RoundKind,
  Surface,
} from "./types";
import { DNF_GRACE_MINUTES, ROUND_KINDS } from "./types";

/**
 * Where a round ended up — the four outcomes the feed's arc distinguishes.
 *
 * The split that didn't exist before is `in-progress` vs `abandoned`. A round
 * that only ever fired a start looked identical whether it began forty seconds
 * ago or last Tuesday, even though `foldDayService` has drawn exactly this line
 * for the day slice since the open-round split shipped. Same constant
 * ({@link DNF_GRACE_MINUTES}), so a walkout can't be two different things on two
 * tabs of one dashboard.
 */
export const ROUND_STATES = ["in-progress", "abandoned", "solved", "lost"] as const;
export type RoundState = (typeof ROUND_STATES)[number];

/** Short label per state — the arc's text, so the pips never carry it on colour alone. */
export const STATE_LABEL: Record<RoundState, string> = {
  "in-progress": "Still eating",
  abandoned: "Walked out",
  solved: "Solved",
  lost: "Out of guesses",
};

/** One round with everything the row needs derived — nothing here hits the network. */
export interface ActivityRoundView extends ActivityRound {
  state: RoundState;
  /**
   * Milliseconds from the first guess to game over, or null when it never
   * finished — *or* when it finished on a pre-migrations/0011 row that recorded
   * no completion time. A duration is only reported when both ends were really
   * measured.
   */
  solveMs: number | null;
  /** Milliseconds from game over to the share, under the same both-ends rule. */
  shareMs: number | null;
}

/**
 * One visit: a device's whole ET day, with the rounds from it that are on this
 * page of the feed.
 *
 * `rounds` is what's *in view*; `totals` is what the device actually did that
 * day. Those are different numbers and the header prints both, because a group
 * that counted only what it could see would report a nine-round evening as three.
 */
export interface ActivityGroup {
  /** Stable react key: `${day}::${playerId ?? ""}`. */
  key: string;
  day: string;
  /** Null for the day's unattributable rounds — see {@link ActivityRound.playerId}. */
  playerId: string | null;
  /** The arrival row, when one was recorded. Null before the visit beacon shipped. */
  visit: ActivityVisit | null;
  rounds: ActivityRoundView[];
  /** The device's real day, beyond this page. Null when nothing was recorded. */
  totals: { rounds: number; solved: number; shared: number } | null;
  /** Surfaces seen in this group — usually one, and worth showing when it isn't. */
  surfaces: Surface[];
  /** Countries seen, same rule. */
  countries: string[];
  /** Earliest activity in view, including the arrival itself. */
  firstAt: string;
  /** Latest activity in view — what groups sort by. */
  lastAt: string;
  /**
   * The device showed up that day and never played a single round. The funnel's
   * bounce, made concrete: before this it existed only as a percentage.
   */
  bounced: boolean;
}

/** Client-side chips over the fetched page. Empty array in a facet means "all". */
export interface ActivityFilter {
  states: RoundState[];
  kinds: RoundKind[];
  sharedOnly: boolean;
}

export const EMPTY_FILTER: ActivityFilter = { states: [], kinds: [], sharedOnly: false };

export const filterActive = (f: ActivityFilter): boolean =>
  f.states.length > 0 || f.kinds.length > 0 || f.sharedOnly;

/**
 * How many rounds each chip would yield. Every facet's count is computed with
 * *its own* selection dropped, so the number beside "Out of guesses" answers
 * "what if I clicked this" rather than "what is showing" — the rule the dish
 * list's facets already follow, and the only version of the number that's
 * interesting once something else is picked.
 */
export interface ActivityFacets {
  states: Record<RoundState, number>;
  kinds: Record<RoundKind, number>;
  shared: number;
}

/** Everything the panel renders, from one feed page and one clock reading. */
export interface ActivityView {
  /** Filtered, newest activity first. */
  rows: ActivityRoundView[];
  /** The same rows folded into visits, newest activity first. */
  groups: ActivityGroup[];
  facets: ActivityFacets;
  /** Rounds on the page before filtering — the "N of M in view" denominator. */
  total: number;
  /** Rounds in view with no device id, which no visit can claim. */
  unattributed: number;
}

const ms = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/**
 * A gap between two stamps, or null when either end is missing or the gap runs
 * backwards. Negatives are dropped rather than clamped, exactly as `foldSolveTimes`
 * drops them: a round that "finished" three minutes before it started is a broken
 * measurement (a late `/start` beacon), not a fast one, and zeroing it would put
 * a fabricated duration in front of you.
 */
function gap(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const d = ms(to) - ms(from);
  return d < 0 ? null : d;
}

/** Decide each round's outcome and durations against one reading of the clock. */
export function deriveRounds(rounds: readonly ActivityRound[], nowMs: number): ActivityRoundView[] {
  const graceMs = DNF_GRACE_MINUTES * 60_000;
  return rounds.map((r) => {
    const state: RoundState = r.completed
      ? r.solved
        ? "solved"
        : "lost"
      : nowMs - ms(r.startedAt) <= graceMs
        ? "in-progress"
        : "abandoned";
    return {
      ...r,
      state,
      solveMs: gap(r.startedAt, r.completedAt),
      shareMs: gap(r.completedAt, r.sharedAt),
    };
  });
}

const matchesState = (r: ActivityRoundView, f: ActivityFilter) =>
  f.states.length === 0 || f.states.includes(r.state);
const matchesKind = (r: ActivityRoundView, f: ActivityFilter) => f.kinds.length === 0 || f.kinds.includes(r.kind);
const matchesShared = (r: ActivityRoundView, f: ActivityFilter) => !f.sharedOnly || r.shared;

/** Within a facet the picks are OR; across facets they're AND. */
export const matchesFilter = (r: ActivityRoundView, f: ActivityFilter): boolean =>
  matchesState(r, f) && matchesKind(r, f) && matchesShared(r, f);

export function activityFacets(rows: readonly ActivityRoundView[], f: ActivityFilter): ActivityFacets {
  const states = Object.fromEntries(ROUND_STATES.map((s) => [s, 0])) as Record<RoundState, number>;
  const kinds = Object.fromEntries(ROUND_KINDS.map((k) => [k, 0])) as Record<RoundKind, number>;
  let shared = 0;
  for (const r of rows) {
    if (matchesKind(r, f) && matchesShared(r, f)) states[r.state]++;
    if (matchesState(r, f) && matchesShared(r, f)) kinds[r.kind]++;
    if (r.shared && matchesState(r, f) && matchesKind(r, f)) shared++;
  }
  return { states, kinds, shared };
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

/**
 * Fold rounds and arrivals into visits.
 *
 * A group exists for every (ET day, device) pair that either played or showed
 * up. Rounds with no device id can't belong to anyone, so they collect into one
 * `playerId: null` group per day, which the UI labels as such rather than
 * quietly attributing them.
 */
export function groupActivity(
  rows: readonly ActivityRoundView[],
  visits: readonly ActivityVisit[],
  dayTotals: readonly ActivityDayTotal[],
): ActivityGroup[] {
  const key = (day: string, playerId: string | null) => `${day}::${playerId ?? ""}`;
  const groups = new Map<string, ActivityGroup>();

  const ensure = (day: string, playerId: string | null): ActivityGroup => {
    const k = key(day, playerId);
    let g = groups.get(k);
    if (!g) {
      g = {
        key: k,
        day,
        playerId,
        visit: null,
        rounds: [],
        totals: null,
        surfaces: [],
        countries: [],
        firstAt: "",
        lastAt: "",
        bounced: false,
      };
      groups.set(k, g);
    }
    return g;
  };

  for (const r of rows) ensure(r.playedDay, r.playerId).rounds.push(r);
  for (const v of visits) ensure(v.day, v.playerId).visit = v;

  const totals = new Map(dayTotals.map((t) => [key(t.day, t.playerId), t]));

  for (const g of groups.values()) {
    const t = totals.get(g.key);
    g.totals = t ? { rounds: t.rounds, solved: t.solved, shared: t.shared } : null;
    // "Never played" is a claim about the whole day, not about this page: a
    // device with rounds outside the window is not a bounce, and the header says
    // "none in view" for it instead.
    g.bounced = g.rounds.length === 0 && (g.totals === null || g.totals.rounds === 0);
    g.surfaces = uniq([...g.rounds.map((r) => r.surface), ...(g.visit ? [g.visit.surface] : [])]);
    g.countries = uniq(
      [...g.rounds.map((r) => r.country), ...(g.visit ? [g.visit.country] : [])].filter(
        (c): c is string => c !== null,
      ),
    );
    const stamps = [...g.rounds.flatMap((r) => [r.startedAt, r.lastAt]), ...(g.visit ? [g.visit.firstSeenAt] : [])];
    const sorted = [...stamps].sort((a, b) => ms(a) - ms(b));
    g.firstAt = sorted[0] ?? "";
    g.lastAt = sorted[sorted.length - 1] ?? "";
    g.rounds.sort((a, b) => ms(b.lastAt) - ms(a.lastAt));
  }

  return [...groups.values()].sort((a, b) => ms(b.lastAt) - ms(a.lastAt));
}

/**
 * One feed page + one clock reading + the chips → everything the panel draws.
 *
 * Sorted by **last activity**, not by start: a round shared an hour after it was
 * finished comes back to the top with its share pip newly lit, which is what
 * keeps a log of rounds a *live* log rather than an append-only one that goes
 * quiet the moment nobody starts a new game.
 */
export function foldActivity(feed: ActivityFeed, nowMs: number, filter: ActivityFilter): ActivityView {
  const all = deriveRounds(feed.rounds, nowMs);
  const facets = activityFacets(all, filter);
  const rows = all.filter((r) => matchesFilter(r, filter)).sort((a, b) => ms(b.lastAt) - ms(a.lastAt));
  // With a filter on, an arrival whose rounds were all filtered away is noise —
  // you asked to see losses, not the evenings that contained none. With no
  // filter, every arrival is shown, bounces included: that's the point of them.
  const visits = filterActive(filter)
    ? feed.visits.filter((v) => rows.some((r) => r.playerId === v.playerId && r.playedDay === v.day))
    : feed.visits;
  return {
    rows,
    groups: groupActivity(rows, visits, feed.dayTotals),
    facets,
    total: all.length,
    unattributed: rows.filter((r) => r.playerId === null).length,
  };
}
