import { describe, expect, it } from "vitest";
import {
  foldCrossover,
  foldNightReport,
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
  local_hour: 21,
  n: 1,
  ...over,
});

const meta = (over: Partial<DrinkMetaRow> = {}): DrinkMetaRow => ({
  id: 1,
  name: "Negroni",
  country: "Italy",
  spirit: "gin",
  is_alcoholic: 1,
  ...over,
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

  it("places a round on the hour the player's own clock showed", () => {
    const r = foldNightReport([row({ local_hour: 21, n: 3 })], [meta()]);
    expect(r.hours[21]).toBe(3);
    expect(r.hours[2]).toBe(0);
    expect(r.untrackedHour).toBe(0);
    expect(r.outsideHours).toBe(0);
  });

  it("counts a round started outside opening hours without hiding it", () => {
    // The door cannot open at 4pm, so this is a wound-forward clock rather
    // than an early drinker. It is still drawn; it is also still counted.
    const r = foldNightReport([row({ local_hour: 16, n: 2 })], [meta()]);
    expect(r.hours[16]).toBe(2);
    expect(r.outsideHours).toBe(2);
  });

  it("counts a round with no offset apart rather than at midnight", () => {
    const r = foldNightReport([row({ local_hour: null }), row()], [meta()]);
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

  const settled = (rows: CrossoverRow[]) => foldCrossover(rows, "9999-01-01");

  it("counts devices that did both, over devices that finished lunch", () => {
    const r = settled([
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
    const r = settled([
      c({ player_id: "a", finished_lunch: 1, started_nightcap: 1 }),
      c({ player_id: "a", finished_lunch: 1, started_nightcap: 1 }),
    ]);
    expect(r.finishedLunch).toBe(1);
    expect(r.cameToBar).toBe(1);
  });

  it("never lets the rate exceed 100% when a device drank without eating here", () => {
    // Impossible through the front door, possible across two devices. It is
    // not in the denominator, so it must not be in the numerator either.
    const r = settled([
      c({ player_id: "a", finished_lunch: 1 }),
      c({ player_id: "b", finished_lunch: 0, started_nightcap: 1 }),
    ]);
    expect(r.finishedLunch).toBe(1);
    expect(r.cameToBar).toBe(0);
    expect(r.rate?.pct).toBe(0);
    // Counted apart rather than dropped: it is the tell that this measures
    // devices where the sentence above it says people.
    expect(r.barOnly).toBe(1);
  });

  it("pools across days rather than averaging their rates", () => {
    const r = settled([
      c({ day: "2026-09-05", player_id: "a", finished_lunch: 1, started_nightcap: 1 }),
      c({ day: "2026-09-06", player_id: "b", finished_lunch: 1 }),
      c({ day: "2026-09-06", player_id: "c", finished_lunch: 1 }),
      c({ day: "2026-09-06", player_id: "d", finished_lunch: 1 }),
    ]);
    // 1 of 4 pooled, not the mean of 100% and 0%.
    expect(r.rate?.pct).toBe(25);
    expect(r.days.map((d) => d.day)).toEqual(["2026-09-05", "2026-09-06"]);
  });

  it("holds a night still being played out of the pooled rate", () => {
    // A device that finished lunch at noon is not a no-show at a bar that
    // opens at eight. Tonight is reported, and reported separately.
    const r = foldCrossover(
      [
        c({ day: "2026-09-05", player_id: "a", finished_lunch: 1, started_nightcap: 1 }),
        c({ day: "2026-09-06", player_id: "b", finished_lunch: 1 }),
        c({ day: "2026-09-06", player_id: "c", finished_lunch: 1 }),
      ],
      "2026-09-06",
    );
    expect(r.finishedLunch).toBe(1);
    expect(r.cameToBar).toBe(1);
    expect(r.rate?.pct).toBe(100);
    expect(r.pending).toEqual({ nights: 1, finishedLunch: 2, cameToBar: 0 });
    expect(r.days.map((d) => d.settled)).toEqual([true, false]);
    // An unsettled night quotes no rate of its own either.
    expect(r.days[1].rate).toBe(null);
  });

  it("reports no pending night once every night is over", () => {
    const r = settled([c({ finished_lunch: 1, started_nightcap: 1 })]);
    expect(r.pending).toBe(null);
  });

  it("reports no rate at all on a day nobody finished lunch", () => {
    const r = settled([c({ finished_lunch: 0, started_nightcap: 0 })]);
    expect(r.rate).toBe(null);
  });
});
