// The most engaged tenth of devices, set against the other nine. DB-free, so it
// stays unit-testable; the route in routes/admin/analytics.ts feeds it rows.
//
// Why this exists: the dashboard says how many people come back, and nothing about
// what the ones who keep coming back are like. Every figure here is a comparison
// between two groups of devices, so a lever can be pointed at the difference.
//
// What keeps it honest:
//
// 1. **"Regular" is days played, nothing cleverer.** Top tenth by distinct ET days,
//    ties at the line kept in, never below REGULARS_MIN_DAYS. A device that played
//    once is not a regular however few devices there are.
// 2. **The regulars have had more practice**, so "they solve in fewer guesses" is
//    partly the practice. `firstSolvedIn` counts only each device's first finished
//    Special, which is the fair read of whether they began better.
// 3. **Counts out, rates at the edge.** Tallies ship as n-of-m so the client can
//    put a Wilson interval on a thin group.
// 4. **Today's Special only for guess counts.** A Leftover's answer is old and a
//    Nightcap has four guesses; neither is the same achievement.
// 5. **New devices are pending, not "everyone else".** Below the line, a device
//    first seen inside RETENTION_WINDOW_DAYS has not had the days to become a
//    regular; it is counted apart, the way retention counts a censored device.

import { daysBetween } from "../shared/time";
import { medianOf } from "../shared/sample";
import {
  LAPSED_DAYS,
  MAX_GUESSES,
  REGULARS_MIN_DAYS,
  REGULARS_SHARE,
  ROUND_KINDS,
  type RegularsGroup,
  type RegularsReport,
  type RoundKind,
  type Surface,
  type Tally,
} from "../shared/types";
import { RETENTION_WINDOW_DAYS, etDayOfHourBucket } from "./players";

/** One (device, surface, UTC hour, outcome) group, as the query returns it. */
export interface RegularsRoundRow {
  player_id: string;
  surface: Surface;
  /** UTC hour bucket from strftime('%Y-%m-%d %H', started_at). */
  bucket: string;
  kind: RoundKind;
  completed: number;
  solved: number | null;
  shared: number;
  guesses: number | null;
  n: number;
}

/** A device's first-touch source, from the arrivals ledger. */
export interface RegularsVisitRow {
  player_id: string;
  source: string | null;
}

interface DayFlags {
  finished: boolean;
  solved: boolean;
  shared: boolean;
  extra: boolean;
}

interface Device {
  id: string;
  days: Map<string, DayFlags>;
  rounds: number;
  kinds: Set<RoundKind>;
  shared: boolean;
  discord: boolean;
  finished: number;
  solved: number;
  specialShared: number;
  solvedIn: number[];
  /** The device's earliest finished Special, to the hour. */
  first: { bucket: string; guesses: number; solved: boolean } | null;
}

const tally = (n: number, of: number): Tally => ({ n, of });
const zeros = () => Array.from({ length: MAX_GUESSES }, () => 0);

function fold(rows: Iterable<RegularsRoundRow>): Map<string, Device> {
  const devices = new Map<string, Device>();
  for (const r of rows) {
    const day = etDayOfHourBucket(r.bucket);
    if (day === null) continue;
    let d = devices.get(r.player_id);
    if (!d) {
      d = {
        id: r.player_id,
        days: new Map(),
        rounds: 0,
        kinds: new Set(),
        shared: false,
        discord: false,
        finished: 0,
        solved: 0,
        specialShared: 0,
        solvedIn: zeros(),
        first: null,
      };
      devices.set(r.player_id, d);
    }
    const flags = d.days.get(day) ?? { finished: false, solved: false, shared: false, extra: false };
    d.days.set(day, flags);
    d.rounds += r.n;
    d.kinds.add(r.kind);
    if (r.surface === "discord") d.discord = true;
    if (r.shared) {
      d.shared = true;
      flags.shared = true;
    }
    if (r.kind !== "daily") {
      flags.extra = true;
      continue;
    }
    if (!r.completed) continue;
    d.finished += r.n;
    flags.finished = true;
    if (r.shared) d.specialShared += r.n;
    const won = r.solved === 1 && r.guesses !== null && r.guesses >= 1 && r.guesses <= MAX_GUESSES;
    if (won) {
      d.solved += r.n;
      flags.solved = true;
      d.solvedIn[(r.guesses as number) - 1] += r.n;
    }
    // Hour-level order is the finest the grouped query keeps. A tie inside one
    // hour is two Specials in an hour, which a single device does not do.
    if (d.first === null || r.bucket < d.first.bucket) {
      d.first = { bucket: r.bucket, guesses: r.guesses ?? 0, solved: won };
    }
  }
  return devices;
}

/** Longest run of back-to-back days in an ascending list. */
function longestStreak(days: string[]): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && daysBetween(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

const medianOfList = (xs: number[]): number | null => medianOf(xs.map((x) => [x, 1] as const));

function groupOf(
  members: Device[],
  today: string,
  sourceOf: Map<string, string>,
): RegularsGroup {
  const of = members.length;
  const kindCount = Object.fromEntries(ROUND_KINDS.map((k) => [k, 0])) as Record<RoundKind, number>;
  const solvedIn = zeros();
  const firstSolvedIn = zeros();
  const days: number[] = [];
  const attendance: number[] = [];
  const gaps: number[] = [];
  const streaks: number[] = [];
  const sources = new Map<string, number>();
  let rounds = 0;
  let playedDays = 0;
  let active = 0;
  let finished = 0;
  let solved = 0;
  let specialShared = 0;
  let sharedEver = 0;
  let discord = 0;
  let firstFinished = 0;
  let firstSolved = 0;
  const dayOne = { finished: 0, solved: 0, shared: 0, extra: 0 };

  for (const d of members) {
    const sorted = [...d.days.keys()].sort();
    rounds += d.rounds;
    playedDays += sorted.length;
    days.push(sorted.length);
    attendance.push(Math.round((sorted.length / (daysBetween(sorted[0], today) + 1)) * 100));
    streaks.push(longestStreak(sorted));
    const waits = sorted.slice(1).map((day, i) => daysBetween(sorted[i], day));
    const gap = medianOfList(waits);
    if (gap !== null) gaps.push(gap);
    if (daysBetween(sorted[sorted.length - 1], today) < LAPSED_DAYS) active += 1;
    for (const k of d.kinds) kindCount[k] += 1;
    if (d.shared) sharedEver += 1;
    if (d.discord) discord += 1;
    finished += d.finished;
    solved += d.solved;
    specialShared += d.specialShared;
    d.solvedIn.forEach((n, i) => (solvedIn[i] += n));
    if (d.first) {
      firstFinished += 1;
      if (d.first.solved) {
        firstSolved += 1;
        firstSolvedIn[d.first.guesses - 1] += 1;
      }
    }
    const one = d.days.get(sorted[0]) as DayFlags;
    if (one.finished) dayOne.finished += 1;
    if (one.solved) dayOne.solved += 1;
    if (one.shared) dayOne.shared += 1;
    if (one.extra) dayOne.extra += 1;
    const source = sourceOf.get(d.id);
    if (source) sources.set(source, (sources.get(source) ?? 0) + 1);
  }

  return {
    devices: of,
    rounds,
    medianDays: medianOfList(days),
    medianAttendance: medianOfList(attendance),
    medianGap: medianOfList(gaps),
    medianStreak: medianOfList(streaks),
    roundsPerDay: playedDays > 0 ? Math.round((rounds / playedDays) * 10) / 10 : null,
    active: tally(active, of),
    special: {
      finished,
      solved: tally(solved, finished),
      shared: tally(specialShared, finished),
      solvedIn,
      firstSolvedIn,
      firstSolved: tally(firstSolved, firstFinished),
    },
    reach: Object.fromEntries(ROUND_KINDS.map((k) => [k, tally(kindCount[k], of)])) as Record<RoundKind, Tally>,
    sharedEver: tally(sharedEver, of),
    discord: tally(discord, of),
    dayOne: {
      finished: tally(dayOne.finished, of),
      solved: tally(dayOne.solved, of),
      shared: tally(dayOne.shared, of),
      extra: tally(dayOne.extra, of),
    },
    sources: [...sources]
      .map(([source, devices]) => ({ source, devices }))
      .sort((a, b) => b.devices - a.devices || a.source.localeCompare(b.source)),
    sourced: [...sources.values()].reduce((a, b) => a + b, 0),
  };
}

export function foldRegulars(
  rows: Iterable<RegularsRoundRow>,
  visits: Iterable<RegularsVisitRow>,
  today: string,
): RegularsReport {
  const devices = [...fold(rows).values()];
  const sourceOf = new Map<string, string>();
  for (const v of visits) if (v.source) sourceOf.set(v.player_id, v.source);

  const byDays = [...devices].sort((a, b) => b.days.size - a.days.size);
  const line = byDays.length === 0 ? 0 : byDays[Math.max(0, Math.ceil(byDays.length * REGULARS_SHARE) - 1)].days.size;
  const cutoff = Math.max(line, REGULARS_MIN_DAYS);
  const regulars = devices.filter((d) => d.days.size >= cutoff);
  const firstDay = (d: Device) => [...d.days.keys()].reduce((a, b) => (b < a ? b : a));
  const settled = (d: Device) => daysBetween(firstDay(d), today) >= RETENTION_WINDOW_DAYS;
  const below = devices.filter((d) => d.days.size < cutoff);
  const rest = below.filter(settled);

  const allRounds = devices.reduce((n, d) => n + d.rounds, 0);
  const regularRounds = regulars.reduce((n, d) => n + d.rounds, 0);
  const since = devices.length === 0 ? null : devices.map(firstDay).reduce((a, b) => (b < a ? b : a));

  return {
    devices: devices.length,
    cutoffDays: regulars.length > 0 ? cutoff : null,
    regulars: regulars.length > 0 ? groupOf(regulars, today, sourceOf) : null,
    rest: groupOf(rest, today, sourceOf),
    pending: below.length - rest.length,
    windowDays: RETENTION_WINDOW_DAYS,
    roundsShare: tally(regularRounds, allRounds),
    since,
    today,
  };
}
