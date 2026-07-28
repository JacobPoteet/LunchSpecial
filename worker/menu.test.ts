import { describe, expect, it } from "vitest";
import { assembleMenuMix, MENU_INGREDIENTS_MAX, MENU_TIMELINE_MAX, type MenuDishRow, type MenuScheduleRow } from "./menu";
import { EPOCH_DATE } from "../shared/types";

let nextId = 1;
/** A dish row with sane defaults; override whatever the case is about. */
const dish = (over: Partial<MenuDishRow> = {}): MenuDishRow => ({
  id: nextId++,
  name: `Dish ${nextId}`,
  country: "Italy",
  region: "europe",
  course: "entree",
  temperature: "hot",
  protein: "vegetarian",
  ingredients: '["tomato","basil"]',
  ...over,
});

const on = (date: string, over: Partial<MenuDishRow> = {}): MenuScheduleRow => ({ ...dish(over), date });

// EPOCH_DATE is puzzle #1; +3 days is #4.
const day = (offset: number) =>
  new Date(Date.parse(`${EPOCH_DATE}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

describe("assembleMenuMix", () => {
  it("zeroes every enum bucket for an empty schedule and pool", () => {
    const mix = assembleMenuMix([], [], EPOCH_DATE);
    expect(mix.served.servings).toBe(0);
    expect(mix.served.dishes).toBe(0);
    expect(mix.served.region.europe).toBe(0);
    expect(mix.served.course.dessert).toBe(0);
    expect(mix.served.protein.lamb).toBe(0);
    expect(mix.served.temperature.cold).toBe(0);
    expect(mix.countries).toEqual([]);
    expect(mix.ingredients).toEqual([]);
    expect(mix.repeats).toEqual([]);
    expect(mix.neverServed).toBe(0);
    expect(mix.timeline).toEqual([]);
    expect(mix.today).toBe(EPOCH_DATE);
  });

  it("splits served from upcoming on today, counting today as served", () => {
    const rows = [
      on(day(0), { region: "europe" }),
      on(day(1), { region: "east-asia" }),
      on(day(2), { region: "africa" }), // today
      on(day(3), { region: "oceania" }),
    ];
    const mix = assembleMenuMix(rows, [], day(2));
    expect(mix.served.servings).toBe(3);
    expect(mix.served.region).toMatchObject({ europe: 1, "east-asia": 1, africa: 1, oceania: 0 });
    expect(mix.upcoming.servings).toBe(1);
    expect(mix.upcoming.region.oceania).toBe(1);
  });

  it("ignores schedule rows from before puzzle #1", () => {
    const mix = assembleMenuMix([on(day(-5)), on(day(0))], [], day(0));
    expect(mix.served.servings).toBe(1);
    expect(mix.timeline).toHaveLength(1);
  });

  it("counts every attribute of a serving", () => {
    const mix = assembleMenuMix(
      [on(day(0), { region: "south-asia", course: "dessert", protein: "lamb", temperature: "cold" })],
      [],
      day(0),
    );
    expect(mix.served.region["south-asia"]).toBe(1);
    expect(mix.served.course.dessert).toBe(1);
    expect(mix.served.protein.lamb).toBe(1);
    expect(mix.served.temperature.cold).toBe(1);
  });

  it("counts a serving whose region is off-enum without inventing a bucket", () => {
    // region has no DB CHECK, so a hand-edited row can carry anything.
    const mix = assembleMenuMix([on(day(0), { region: "atlantis" })], [], day(0));
    expect(mix.served.servings).toBe(1);
    expect(Object.values(mix.served.region).reduce((a, b) => a + b, 0)).toBe(0);
    // Its other attributes still count.
    expect(mix.served.course.entree).toBe(1);
  });

  it("separates servings from distinct dishes, and lists the repeats", () => {
    const repeat = dish({ name: "Hamburger" });
    const mix = assembleMenuMix(
      [
        { ...repeat, date: day(0) },
        { ...dish({ name: "Pho" }), date: day(1) },
        { ...repeat, date: day(2) },
      ],
      [],
      day(2),
    );
    expect(mix.served.servings).toBe(3);
    expect(mix.served.dishes).toBe(2);
    expect(mix.repeats).toEqual([
      { dishId: repeat.id, name: "Hamburger", servings: 2, lastServed: day(2) },
    ]);
  });

  it("ranks countries by servings and remembers when each was last on", () => {
    const mix = assembleMenuMix(
      [
        on(day(0), { country: "Japan", region: "east-asia" }),
        on(day(1), { country: "Italy" }),
        on(day(2), { country: "Japan", region: "east-asia" }),
      ],
      [],
      day(2),
    );
    expect(mix.countries).toEqual([
      { country: "Japan", region: "east-asia", servings: 2, lastServed: day(2) },
      { country: "Italy", region: "europe", servings: 1, lastServed: day(1) },
    ]);
  });

  it("counts ingredients once per serving and caps the list", () => {
    const many = Array.from({ length: MENU_INGREDIENTS_MAX + 5 }, (_, i) => `spice-${i}`);
    const mix = assembleMenuMix(
      [
        on(day(0), { ingredients: '["tomato","onion"]' }),
        on(day(1), { ingredients: '["tomato"]' }),
        on(day(2), { ingredients: JSON.stringify(many) }),
      ],
      [],
      day(2),
    );
    expect(mix.ingredients).toHaveLength(MENU_INGREDIENTS_MAX);
    expect(mix.ingredients[0]).toEqual({ name: "tomato", servings: 2 });
  });

  it("survives a corrupt ingredients column", () => {
    const mix = assembleMenuMix([on(day(0), { ingredients: "not json" })], [], day(0));
    expect(mix.ingredients).toEqual([]);
    expect(mix.served.servings).toBe(1);
  });

  it("counts pool dishes that have never been the Special", () => {
    const served = dish();
    const bench = dish();
    const mix = assembleMenuMix([{ ...served, date: day(0) }], [served, bench, dish()], day(0));
    expect(mix.pool.servings).toBe(3);
    expect(mix.neverServed).toBe(2);
  });

  it("counts days since puzzle #1 that had no schedule row", () => {
    // Day 3 is today (puzzle #4) and only two of those days were scheduled.
    const mix = assembleMenuMix([on(day(0)), on(day(2))], [], day(3));
    expect(mix.unscheduledDays).toBe(2);
  });

  it("never reports negative unscheduled days", () => {
    expect(assembleMenuMix([], [], day(-3)).unscheduledDays).toBe(0);
  });

  it("keeps the newest Specials in the timeline, oldest first", () => {
    const rows = Array.from({ length: MENU_TIMELINE_MAX + 10 }, (_, i) => on(day(i)));
    const mix = assembleMenuMix(rows, [], day(MENU_TIMELINE_MAX + 9));
    expect(mix.timeline).toHaveLength(MENU_TIMELINE_MAX);
    expect(mix.timeline[0].date).toBe(day(10));
    expect(mix.timeline.at(-1)!.date).toBe(day(MENU_TIMELINE_MAX + 9));
    expect(mix.served.servings).toBe(MENU_TIMELINE_MAX + 10);
  });

  it("sorts an out-of-order schedule before reading last-served dates", () => {
    const repeat = dish({ name: "Tacos", country: "Mexico", region: "latin-america" });
    const mix = assembleMenuMix(
      [
        { ...repeat, date: day(4) },
        { ...repeat, date: day(1) },
      ],
      [],
      day(5),
    );
    expect(mix.repeats[0].lastServed).toBe(day(4));
    expect(mix.countries[0].lastServed).toBe(day(4));
    expect(mix.timeline.map((t) => t.date)).toEqual([day(1), day(4)]);
  });
});
