import { describe, expect, it } from "vitest";
import {
  foldCrossover,
  foldNightReport,
  localHourOf,
  type CrossoverRow,
  type DrinkMetaRow,
  type NightRoundRow,
} from "./nightstats";
import { DRINK_MAX_GUESSES } from "../shared/types";

const row = (over: Partial<NightRoundRow> = {}): NightRoundRow => ({
  play_date: "2026-09-20",
  completed: 1,
  solved: 1,
  shared: 0,
  guesses: 2,
  drink_id: 1,
  tz_offset: -300,
  bucket: "2026-09-21 02", // 21:00 in UTC-5
  n: 1,
  ...over,
});

const meta = (over: Partial<DrinkMetaRow> = {}): DrinkMetaRow => ({
  id: 1,
  name: "Negroni",
  country: "Italy",
  spirit: "gin",
  profile: "bitter",
  is_alcoholic: 1,
  times_poured: 1,
  ...over,
});

describe("localHourOf", () => {
  it("shifts a UTC bucket into the player's own evening", () => {
    // 02:00 UTC is 21:00 in New York — the hour the bar is busiest, and
    // nowhere near the 2am the raw bucket would put it in.
    expect(localHourOf("2026-09-21 02", -300)).toBe(21);
  });

  it("wraps forwards and backwards across midnight", () => {
    expect(localHourOf("2026-09-21 23", 120)).toBe(1);
    expect(localHourOf("2026-09-21 01", -180)).toBe(22);
  });

  it("floors a half-hour zone to the hour the clock actually showed", () => {
    // India is +5:30. 15:00 UTC is 20:30 there, which is the eight o'clock
    // hour — the bar had just opened, and rounding up would say it hadn't.
    expect(localHourOf("2026-09-21 15", 330)).toBe(20);
    // Nepal, +5:45, on the same logic.
    expect(localHourOf("2026-09-21 15", 345)).toBe(20);
  });

  it("refuses to place a round with no offset", () => {
    // Unmeasured, not midnight. The report counts these separately.
    expect(localHourOf("2026-09-21 02", null)).toBe(null);
  });
});

describe("foldNightReport", () => {
  it("pools rates over the period rather than averaging nights", () => {
    // A one-round night at 0% and a four-round night at 100% is 4/5, not 50%.
    const r = foldNightReport(
      [
        row({ play_date: "2026-09-20", solved: 0, n: 1 }),
        row({ play_date: "2026-09-21", solved: 1, n: 4 }),
      ],
      [meta()],
    );
    expect(r.totals.completed).toBe(5);
    expect(r.totals.solved).toBe(4);
    expect(r.totals.winRate?.pct).toBe(80);
  });

  it("keeps the guess distribution four wide", () => {
    const r = foldNightReport([row({ guesses: 4 })], [meta()]);
    expect(r.guessDistribution).toHaveLength(DRINK_MAX_GUESSES);
    expect(r.guessDistribution).toEqual([0, 0, 0, 1]);
  });

  it("never counts an unfinished round in the distribution", () => {
    const r = foldNightReport([row({ completed: 0, solved: 0, guesses: null })], [meta()]);
    expect(r.guessDistribution).toEqual([0, 0, 0, 0]);
    expect(r.totals.started).toBe(1);
    expect(r.totals.completed).toBe(0);
  });

  it("counts a round with no offset apart rather than at midnight", () => {
    const r = foldNightReport([row({ tz_offset: null }), row()], [meta()]);
    expect(r.untrackedHour).toBe(1);
    expect(r.hours[0]).toBe(0);
    expect(r.hours[21]).toBe(1);
  });

  it("splits the win rate on the stored alcohol flag, not the spirit", () => {
    // The pairing that would break if anyone "simplified" is_alcoholic into
    // spirit != 'none': a beer has no base spirit and is very much a drink.
    const r = foldNightReport(
      [
        row({ drink_id: 1, solved: 1, n: 3 }),
        row({ drink_id: 2, solved: 0, n: 1 }),
        row({ drink_id: 2, solved: 1, n: 1 }),
      ],
      [
        meta({ id: 1, spirit: "beer", is_alcoholic: 1 }),
        meta({ id: 2, name: "Ayran", spirit: "none", is_alcoholic: 0 }),
      ],
    );
    expect(r.alcohol.boozy).toMatchObject({ completed: 3, solved: 3 });
    expect(r.alcohol.sober).toMatchObject({ completed: 2, solved: 1 });
  });

  it("reports a round with no drink as untracked, never against a drink", () => {
    const r = foldNightReport([row({ drink_id: null }), row()], [meta()]);
    expect(r.untrackedDrink).toBe(1);
    expect(r.drinks).toHaveLength(1);
    expect(r.drinks[0].started).toBe(1);
  });

  it("sorts the hardest drink first and parks the unfinished ones last", () => {
    const r = foldNightReport(
      [
        row({ drink_id: 1, solved: 1, n: 10 }),
        row({ drink_id: 2, solved: 0, n: 10 }),
        row({ drink_id: 3, completed: 0, solved: 0, guesses: null, n: 2 }),
      ],
      [meta({ id: 1 }), meta({ id: 2, name: "Sidecar" }), meta({ id: 3, name: "Sorrel" })],
    );
    // A drink nobody has finished has not earned a 0% win rate, so it goes to
    // the bottom rather than to the top of a "hardest first" list.
    expect(r.drinks.map((d) => d.name)).toEqual(["Sidecar", "Negroni", "Sorrel"]);
  });

  it("averages guesses only over the rounds that were solved", () => {
    const r = foldNightReport(
      [row({ solved: 1, guesses: 2, n: 1 }), row({ solved: 1, guesses: 4, n: 1 }), row({ completed: 1, solved: 0, guesses: 4 })],
      [meta()],
    );
    expect(r.drinks[0].avgGuesses).toBeCloseTo(3);
  });

  it("orders the nights oldest first and omits nights with nothing", () => {
    const r = foldNightReport(
      [row({ play_date: "2026-09-22" }), row({ play_date: "2026-09-20" })],
      [meta()],
    );
    // Omitted rather than zero-filled: before the bar opened there is nothing
    // to report, and a flat zero would claim a quiet night that never happened.
    expect(r.days.map((d) => d.night)).toEqual(["2026-09-20", "2026-09-22"]);
  });
});

describe("foldCrossover", () => {
  const c = (over: Partial<CrossoverRow> = {}): CrossoverRow => ({
    player_id: "p1",
    day: "2026-09-20",
    finished_lunch: 1,
    started_nightcap: 0,
    ...over,
  });

  it("counts devices that did both, over devices that finished lunch", () => {
    const r = foldCrossover([
      c({ player_id: "a", finished_lunch: 1, started_nightcap: 1 }),
      c({ player_id: "b", finished_lunch: 1 }),
      c({ player_id: "c", finished_lunch: 1 }),
      c({ player_id: "d", finished_lunch: 1 }),
    ]);
    expect(r.finishedLunch).toBe(4);
    expect(r.cameToBar).toBe(1);
    expect(r.rate?.pct).toBe(25);
  });

  it("counts a device once however many rounds it played", () => {
    // The question is how many people came back for a drink, not how many
    // drinks got poured.
    const r = foldCrossover([
      c({ player_id: "a", finished_lunch: 1, started_nightcap: 1 }),
      c({ player_id: "a", finished_lunch: 1, started_nightcap: 1 }),
    ]);
    expect(r.finishedLunch).toBe(1);
    expect(r.cameToBar).toBe(1);
  });

  it("never lets the rate exceed 100% when a device drank without eating here", () => {
    // Impossible through the front door, possible across two devices. It is
    // not in the denominator, so it must not be in the numerator either.
    const r = foldCrossover([
      c({ player_id: "a", finished_lunch: 1 }),
      c({ player_id: "b", finished_lunch: 0, started_nightcap: 1 }),
    ]);
    expect(r.finishedLunch).toBe(1);
    expect(r.cameToBar).toBe(0);
    expect(r.rate?.pct).toBe(0);
  });

  it("pools across days rather than averaging their rates", () => {
    const r = foldCrossover([
      c({ day: "d1", player_id: "a", finished_lunch: 1, started_nightcap: 1 }),
      c({ day: "d2", player_id: "b", finished_lunch: 1 }),
      c({ day: "d2", player_id: "c", finished_lunch: 1 }),
      c({ day: "d2", player_id: "d", finished_lunch: 1 }),
    ]);
    // 1 of 4 pooled, not the mean of 100% and 0%.
    expect(r.rate?.pct).toBe(25);
    expect(r.days.map((d) => d.day)).toEqual(["d1", "d2"]);
  });

  it("reports no rate at all on a day nobody finished lunch", () => {
    const r = foldCrossover([c({ finished_lunch: 0, started_nightcap: 0 })]);
    expect(r.rate).toBe(null);
  });
});
