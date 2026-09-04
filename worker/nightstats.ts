// Pure After Dark analytics for the admin's own tab. DB-free; the route runs
// the queries and hands the raw rows here.
//
// Every rule the rest of the dashboard obeys applies, and three of them bite
// harder here than anywhere else:
//
// 1. **Never pool a Nightcap with a Special.** Four guesses against six. The
//    caller narrows to kind = 'nightcap' before any of this runs, and the
//    distribution below is four wide by construction.
// 2. **Unmeasured is not zero.** Nights before the bar opened have no rows, and
//    a device whose client predates `tz_offset` has no local hour. Both are
//    reported as absent rather than as a quiet night or as midnight.
// 3. **A rate under SMALL_SAMPLE_MIN carries its interval.** The bar is the
//    smallest audience in the game by construction — it is one drink a night,
//    behind a door — so most of these numbers will be small for a long time and
//    the intervals are the honest part.

import { DRINK_MAX_GUESSES } from "../shared/types";
// The response shapes live in shared/types.ts like every other admin payload:
// the app project cannot import from worker/, and the panel needs them.
import type {
  AlcoholSplit,
  Crossover,
  CrossoverDay,
  NightDrinkRow,
  NightReport,
  NightServiceDay,
} from "../shared/types";
import { rate } from "../shared/sample";

/** One grouped row of Nightcap rounds. */
export interface NightRoundRow {
  /** The LOCAL night key, not an ET day. */
  play_date: string;
  completed: number;
  solved: number | null;
  shared: number;
  /** Guesses used, or null on a round that never finished. */
  guesses: number | null;
  drink_id: number | null;
  /** Minutes east of UTC, or null on a round recorded before it was collected. */
  tz_offset: number | null;
  /** UTC hour bucket the round started in, "YYYY-MM-DD HH". */
  bucket: string;
  n: number;
}

/** Catalogue detail for the drinks those rounds landed on. */
export interface DrinkMetaRow {
  id: number;
  name: string;
  country: string;
  spirit: string;
  profile: string;
  is_alcoholic: number;
  times_poured: number;
}

/** Sum a field across grouped rows. */
function sum(rows: NightRoundRow[], pick: (r: NightRoundRow) => number): number {
  return rows.reduce((t, r) => t + pick(r), 0);
}

/**
 * The local hour a round started in.
 *
 * `bucket` is a UTC hour ("2026-09-04 23"); the offset is minutes east of UTC.
 * Offsets are not all whole hours (India is +330, Nepal +345), so this floors to
 * the hour the player's clock actually showed rather than rounding — 21:45 local
 * is the nine o'clock hour, not the ten.
 */
export function localHourOf(bucket: string, tzOffset: number | null): number | null {
  if (tzOffset === null || !Number.isFinite(tzOffset)) return null;
  const utcHour = Number(bucket.slice(11, 13));
  if (!Number.isInteger(utcHour)) return null;
  const minutes = utcHour * 60 + tzOffset;
  return ((Math.floor(minutes / 60) % 24) + 24) % 24;
}

export function foldNightReport(rows: NightRoundRow[], meta: DrinkMetaRow[]): NightReport {
  const byNight = new Map<string, NightServiceDay>();
  const dist = Array.from({ length: DRINK_MAX_GUESSES }, () => 0);
  const hours = Array.from({ length: 24 }, () => 0);
  let untrackedHour = 0;
  let untrackedDrink = 0;

  const byDrink = new Map<number, NightDrinkRow>();
  const metaById = new Map(meta.map((m) => [m.id, m]));
  // Guess totals per drink, kept beside the row so the mean can be finished
  // after the loop rather than accumulated as a running average.
  const guessTotals = new Map<number, { guesses: number; solved: number }>();

  const alcohol: AlcoholSplit = {
    boozy: { completed: 0, solved: 0, winRate: null },
    sober: { completed: 0, solved: 0, winRate: null },
  };

  for (const r of rows) {
    const day = byNight.get(r.play_date) ?? {
      night: r.play_date,
      started: 0,
      completed: 0,
      solved: 0,
      shared: 0,
    };
    day.started += r.n;
    day.completed += r.completed * r.n;
    day.solved += (r.solved ?? 0) * r.n;
    day.shared += r.shared * r.n;
    byNight.set(r.play_date, day);

    if (r.completed === 1 && r.solved === 1 && r.guesses !== null) {
      if (r.guesses >= 1 && r.guesses <= DRINK_MAX_GUESSES) dist[r.guesses - 1] += r.n;
    }

    const hour = localHourOf(r.bucket, r.tz_offset);
    if (hour === null) untrackedHour += r.n;
    else hours[hour] += r.n;

    const info = r.drink_id === null ? undefined : metaById.get(r.drink_id);
    if (!info) {
      // A NULL drink_id, or one pointing at a drink since deleted. Reported on
      // its own rather than folded into a drink it might not be.
      untrackedDrink += r.n;
    } else {
      const row = byDrink.get(info.id) ?? {
        drinkId: info.id,
        name: info.name,
        country: info.country,
        spirit: info.spirit,
        isAlcoholic: info.is_alcoholic === 1,
        started: 0,
        completed: 0,
        solved: 0,
        shared: 0,
        winRate: null,
        avgGuesses: null,
      };
      row.started += r.n;
      row.completed += r.completed * r.n;
      row.solved += (r.solved ?? 0) * r.n;
      row.shared += r.shared * r.n;
      byDrink.set(info.id, row);

      if (r.completed === 1) {
        const bucket = info.is_alcoholic === 1 ? alcohol.boozy : alcohol.sober;
        bucket.completed += r.n;
        bucket.solved += (r.solved ?? 0) * r.n;
      }
      if (r.solved === 1 && r.guesses !== null) {
        const g = guessTotals.get(info.id) ?? { guesses: 0, solved: 0 };
        g.guesses += r.guesses * r.n;
        g.solved += r.n;
        guessTotals.set(info.id, g);
      }
    }
  }

  const drinks = [...byDrink.values()].map((row) => {
    const g = guessTotals.get(row.drinkId);
    return {
      ...row,
      winRate: rate(row.solved, row.completed),
      avgGuesses: g && g.solved > 0 ? g.guesses / g.solved : null,
    };
  });
  // Hardest first, the same order the dish report uses — the row you would act
  // on is the one players are losing to. Drinks with nothing finished sort last
  // rather than as a 0% win rate they never earned.
  drinks.sort((a, b) => {
    if (a.completed === 0 && b.completed === 0) return a.name.localeCompare(b.name);
    if (a.completed === 0) return 1;
    if (b.completed === 0) return -1;
    return (a.winRate?.pct ?? 100) - (b.winRate?.pct ?? 100);
  });

  alcohol.boozy.winRate = rate(alcohol.boozy.solved, alcohol.boozy.completed);
  alcohol.sober.winRate = rate(alcohol.sober.solved, alcohol.sober.completed);

  const started = sum(rows, (r) => r.n);
  const completed = sum(rows, (r) => r.completed * r.n);
  const solved = sum(rows, (r) => (r.solved ?? 0) * r.n);
  const shared = sum(rows, (r) => r.shared * r.n);

  return {
    days: [...byNight.values()].sort((a, b) => a.night.localeCompare(b.night)),
    totals: {
      started,
      completed,
      solved,
      shared,
      // Pooled over the whole period, never averaged across nights: a one-round
      // Tuesday must not outvote a busy Saturday.
      winRate: rate(solved, completed),
      finishRate: rate(completed, started),
      shareRate: rate(shared, completed),
    },
    guessDistribution: dist,
    hours,
    untrackedHour,
    alcohol,
    drinks,
    untrackedDrink,
  };
}

/** One device's activity on one ET day, for the crossover fold. */
export interface CrossoverRow {
  player_id: string;
  /** ET day for the lunch half; the local night key for the bar half. */
  day: string;
  finished_lunch: number;
  started_nightcap: number;
}

/**
 * The headline: of the devices that finished a Special, how many went on to the
 * bar that night.
 *
 * The denominator is devices that **finished lunch**, not devices that visited,
 * because finishing lunch is literally the door — everyone in the denominator
 * could have walked through it. That is the one thing the gate bought us
 * analytically, and it is why this number means something a funnel rung
 * normally cannot.
 *
 * Devices, not rounds. A player who opened the bar twice is one person who came
 * back for a drink, and rounds-per-device is a different question.
 *
 * A device that played the bar WITHOUT finishing lunch cannot exist through the
 * front door, but can exist in the data: an admin preview is untracked, but a
 * player who finished lunch on their phone and drank on their laptop is two
 * devices. Those land in `cameToBar` only if they also finished lunch, so the
 * rate can never exceed 100%.
 */
export function foldCrossover(rows: CrossoverRow[]): Crossover {
  const byDay = new Map<string, { lunch: Set<string>; bar: Set<string> }>();
  for (const r of rows) {
    const d = byDay.get(r.day) ?? { lunch: new Set<string>(), bar: new Set<string>() };
    if (r.finished_lunch > 0) d.lunch.add(r.player_id);
    if (r.started_nightcap > 0) d.bar.add(r.player_id);
    byDay.set(r.day, d);
  }

  const days: CrossoverDay[] = [];
  let finishedLunch = 0;
  let cameToBar = 0;
  for (const [day, sets] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let crossed = 0;
    for (const id of sets.bar) if (sets.lunch.has(id)) crossed++;
    days.push({
      day,
      finishedLunch: sets.lunch.size,
      cameToBar: crossed,
      rate: rate(crossed, sets.lunch.size),
    });
    finishedLunch += sets.lunch.size;
    cameToBar += crossed;
  }

  // Pooled, like every other rate on the dashboard.
  return { days, finishedLunch, cameToBar, rate: rate(cameToBar, finishedLunch) };
}
