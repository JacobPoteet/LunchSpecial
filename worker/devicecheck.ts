// One device against the house, for the check the Activity feed opens on a
// device id. DB-free; the route in routes/admin/activity.ts feeds it rows.
//
// What keeps it honest:
//
// 1. **The same devices as the regulars table.** Rounds go through
//    `foldDevices` and the line through `regularsCutoff`, so "a regular" here and
//    on the Players tab can never disagree.
// 2. **The house is settled devices only.** Everyone else past their first week,
//    this device left out. A device three days old has had three days to play,
//    and counting it would pull every median toward one.
// 3. **Ranks, not estimates.** `rank` is "3rd of 23", an exact count over a
//    known group, so it carries no interval. The rates on the
//    check are n-of-m and the client puts a Wilson range on a thin one.
// 4. **Today's Special only for guess counts**, like every other report.
// 5. **No per-device guess trail.** Counts per kind, never which dishes.

import { addDays, daysBetween } from "../shared/time";
import { medianOf } from "../shared/sample";
import {
  DEVICE_CHECK_WEEKS,
  MAX_GUESSES,
  ROUND_KINDS,
  type DeviceCheck,
  type DeviceDayState,
  type DeviceStanding,
  type RoundKind,
  type Surface,
} from "../shared/types";
import {
  firstDayOf,
  foldDevices,
  isSettled,
  longestStreak,
  medianOfList,
  regularsCutoff,
  type Device,
  type RegularsRoundRow,
} from "./regulars";

/** This device's rounds, grouped by (kind, surface, country). */
export interface DeviceKindRow {
  kind: RoundKind;
  surface: Surface;
  country: string | null;
  rounds: number;
  finished: number;
  solved: number;
  /** Newest COALESCE(shared_at, completed_at, updated_at, started_at), SQLite UTC. */
  last_at: string;
}

/** This device's first arrival, from the arrivals ledger. */
export interface DeviceArrivalRow {
  first_day: string | null;
  source: string | null;
}

/** The measures a device is ranked on, and whether fewer ranks higher. */
type Measure = keyof DeviceCheck["standings"];
const LOWER_IS_BETTER: Record<Measure, boolean> = {
  daysPlayed: false,
  attendance: false,
  gap: true,
  roundsPerDay: false,
  longestRun: false,
  medianGuesses: true,
};

function measures(d: Device, today: string): Record<Measure, number | null> {
  const days = [...d.days.keys()].sort();
  const waits = days.slice(1).map((day, i) => daysBetween(days[i], day));
  return {
    daysPlayed: days.length,
    attendance: Math.round((days.length / (daysBetween(days[0], today) + 1)) * 100),
    gap: medianOfList(waits),
    roundsPerDay: Math.round((d.rounds / days.length) * 10) / 10,
    longestRun: longestStreak(days),
    medianGuesses: medianOf(d.solvedIn.map((n, i) => [i + 1, n] as const)),
  };
}

/** Where `value` ranks among `house` plus itself. Ties share the better rank. */
export function standingOf(value: number | null, house: number[], lowerIsBetter: boolean): DeviceStanding {
  const median = medianOfList(house);
  if (value === null) return { value, house: median, rank: null, of: house.length };
  const better = house.filter((h) => (lowerIsBetter ? h < value : h > value)).length;
  return { value, house: median, rank: better + 1, of: house.length + 1 };
}

/** Monday-first weeks ending on today's, cut at today. */
export function calendarDays(today: string, weeks = DEVICE_CHECK_WEEKS): string[] {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const start = addDays(today, -((dow + 6) % 7) - 7 * (weeks - 1));
  const out: string[] = [];
  for (let day = start; day <= today; day = addDays(day, 1)) out.push(day);
  return out;
}

const instant = (stamp: string): string => `${stamp.replace(" ", "T")}Z`;

export function foldDeviceCheck(
  playerId: string,
  rows: Iterable<RegularsRoundRow>,
  kindRows: DeviceKindRow[],
  arrival: DeviceArrivalRow | null,
  today: string,
): DeviceCheck {
  const devices = [...foldDevices(rows).values()];
  const me = devices.find((d) => d.id === playerId) ?? null;
  const cutoff = regularsCutoff(devices);
  const house = devices.filter((d) => d.id !== playerId && isSettled(d, today));

  const mine = me ? measures(me, today) : null;
  const theirs = house.map((d) => measures(d, today));
  const standing = (m: Measure) =>
    standingOf(
      mine?.[m] ?? null,
      theirs.map((t) => t[m]).filter((v): v is number => v !== null),
      LOWER_IS_BETTER[m],
    );

  const kinds = Object.fromEntries(
    ROUND_KINDS.map((k) => [k, { rounds: 0, finished: 0, solved: 0 }]),
  ) as DeviceCheck["kinds"];
  const byCountry = new Map<string, number>();
  const surfaces = new Set<Surface>();
  let lastAt: string | null = null;
  for (const r of kindRows) {
    const k = kinds[r.kind];
    if (!k) continue;
    k.rounds += r.rounds;
    k.finished += r.finished;
    k.solved += r.solved;
    surfaces.add(r.surface);
    if (r.country) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + r.rounds);
    if (lastAt === null || r.last_at > lastAt) lastAt = r.last_at;
  }

  const pooled = { finished: 0, solved: 0, shared: 0, solvedIn: Array.from({ length: MAX_GUESSES }, () => 0) };
  for (const d of house) {
    pooled.finished += d.finished;
    pooled.solved += d.solved;
    pooled.shared += d.specialShared;
    d.solvedIn.forEach((n, i) => (pooled.solvedIn[i] += n));
  }

  const firstDay = me ? firstDayOf(me) : null;
  const calendar = calendarDays(today).map((day): { day: string; state: DeviceDayState } => {
    const flags = me?.days.get(day);
    if (flags) return { day, state: flags.finished ? "special" : "other" };
    return { day, state: firstDay !== null && day >= firstDay ? "off" : "before" };
  });

  return {
    playerId,
    today,
    firstDay,
    firstVisit: arrival?.first_day ?? null,
    lastAt: lastAt === null ? null : instant(lastAt),
    daysPlayed: me?.days.size ?? 0,
    span: firstDay === null ? null : daysBetween(firstDay, today) + 1,
    countries: [...byCountry].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c),
    surfaces: [...surfaces].sort(),
    source: arrival?.source ?? null,
    standing: me === null ? "none" : me.days.size >= cutoff ? "regular" : isSettled(me, today) ? "settled" : "new",
    cutoffDays: cutoff,
    rank: me === null ? null : 1 + devices.filter((d) => d.days.size > me.days.size).length,
    devices: devices.length,
    house: house.length,
    kinds,
    special: {
      finished: me?.finished ?? 0,
      solved: me?.solved ?? 0,
      shared: me?.specialShared ?? 0,
      solvedIn: me ? [...me.solvedIn] : Array.from({ length: MAX_GUESSES }, () => 0),
    },
    houseSpecial: pooled,
    standings: {
      daysPlayed: standing("daysPlayed"),
      attendance: standing("attendance"),
      gap: standing("gap"),
      roundsPerDay: standing("roundsPerDay"),
      longestRun: standing("longestRun"),
      medianGuesses: standing("medianGuesses"),
    },
    calendar,
  };
}
