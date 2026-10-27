import { describe, expect, it } from "vitest";
import type { Course, Dish, Protein, Region, Temperature } from "../shared/types";
import { MENU_PEEKS } from "../shared/kidsmenu";
import { buildMenu, foldKidsMenuReport, parseGuessed, servePeek } from "./kidsmenu";

let nextId = 100;
const dish = (
  name: string,
  country: string,
  region: Region,
  course: Course,
  temperature: Temperature,
  protein: Protein,
  ingredients: string[] = ["salt"],
  isActive = true,
): Dish => ({
  id: nextId++,
  name,
  slug: name.toLowerCase(),
  country,
  region,
  course,
  temperature,
  protein,
  ingredients,
  isActive,
  isFanSubmission: false,
});

const fill = (n: number, region: Region, protein: Protein): Dish[] =>
  Array.from({ length: n }, (_, i) => dish(`${region} ${protein} ${i}`, "X", region, "entree", "hot", protein));

const ramen = dish("Ramen", "Japan", "east-asia", "entree", "hot", "pork", ["noodle", "pork", "egg", "scallion"]);
const pool = [ramen, ...fill(9, "east-asia", "pork"), ...fill(20, "east-asia", "beef"), ...fill(40, "europe", "pork")];
// Four misses: one near on the country (China), one pork hit, two blanks.
const board = [
  dish("Mapo Tofu", "China", "east-asia", "dessert", "cold", "vegetarian", ["tofu", "chili"]),
  dish("Bacon Roll", "UK", "europe", "breakfast", "cold", "pork", ["bacon", "egg"]),
  dish("Taco", "Mexico", "latin-america", "appetizer", "cold", "beef", ["tortilla", "beef"]),
  dish("Pavlova", "Australia", "oceania", "dessert", "cold", "vegetarian", ["egg", "sugar"]),
];
const ids = board.map((d) => d.id);

describe("parseGuessed", () => {
  it("takes four or five distinct dish ids", () => {
    expect(parseGuessed([1, 2, 3, 4])).toEqual({ guessed: [1, 2, 3, 4] });
    expect(parseGuessed([1, 2, 3, 4, 5])).toEqual({ guessed: [1, 2, 3, 4, 5] });
  });

  it("refuses a board that couldn't ask for the menu", () => {
    expect(parseGuessed([1, 2, 3])).toHaveProperty("error");
    expect(parseGuessed([1, 2, 3, 4, 5, 6])).toHaveProperty("error");
    expect(parseGuessed([1, 2, 3, 3])).toHaveProperty("error");
    expect(parseGuessed([1, 2, 3, "x"])).toHaveProperty("error");
    expect(parseGuessed("1,2,3,4")).toHaveProperty("error");
  });
});

describe("buildMenu", () => {
  it("derives the facts from the guessed dishes against the target", () => {
    const menu = buildMenu(pool, board, ids, ramen)!;
    expect(menu.filters).toEqual([
      { fact: "region", value: "east-asia" },
      { fact: "protein", value: "pork" },
    ]);
    expect(menu.dishes).toHaveLength(10);
    expect(menu.dishes.map((d) => d.id)).toContain(ramen.id);
  });

  it("sends names, countries, regions and courses, and nothing else", () => {
    const [first] = buildMenu(pool, board, ids, ramen)!.dishes;
    expect(Object.keys(first).sort()).toEqual(["country", "course", "id", "name", "region"]);
  });

  it("refuses a won board and a board naming dishes the catalogue lacks", () => {
    expect(buildMenu(pool, [...board.slice(0, 3), ramen], [...ids.slice(0, 3), ramen.id], ramen)).toBeNull();
    expect(buildMenu(pool, board.slice(0, 3), ids, ramen)).toBeNull();
  });

  it("prints a deactivated target, so the answer is always on the menu", () => {
    const parked = { ...ramen, id: 999, isActive: false };
    const menu = buildMenu(pool, board, ids, parked)!;
    expect(menu.dishes.map((d) => d.id)).toContain(999);
  });
});

describe("servePeek", () => {
  const menu = buildMenu(pool, board, ids, ramen)!;

  it("marks the board's ingredients on the dish", () => {
    const served = servePeek(menu, ramen, board, ramen, [], true);
    expect(served.verdict).toBe("ok");
    expect(served.peek?.lines).toContainEqual({ ingredient: "egg", mark: "matched" });
    expect(served.peek?.peeksLeft).toBe(MENU_PEEKS - 1);
  });

  it("counts down only on a tracked round", () => {
    expect(servePeek(menu, ramen, board, ramen, [], false).peek?.peeksLeft).toBeNull();
  });

  it("refuses a dish off this round's menu", () => {
    const stranger = pool.find((d) => d.region === "europe")!;
    expect(servePeek(menu, stranger, board, ramen, [], true)).toEqual({ verdict: "off-menu" });
  });

  it("stops at the limit, and a second look at a peeked dish is free", () => {
    const [a, b] = menu.dishes.filter((d) => d.id !== ramen.id).map((d) => pool.find((p) => p.id === d.id)!);
    const spent = Array.from({ length: MENU_PEEKS }, (_, i) => menu.dishes[i + 1].id);
    expect(servePeek(menu, ramen, board, ramen, spent, true).verdict).toBe("spent");
    const again = servePeek(menu, a, board, ramen, [a.id, b.id].slice(0, MENU_PEEKS), true);
    expect(again.verdict).toBe("repeat");
    expect(again.peek?.peeksLeft).toBe(0);
  });
});

describe("foldKidsMenuReport", () => {
  it("is unmeasured, not zero, before the first flagged guess", () => {
    const r = foldKidsMenuReport(null, undefined);
    expect(r.measuredFrom).toBeNull();
    expect(r.opened).toBeNull();
  });

  it("rates the open over rounds that reached a fourth miss, and the win over finished rounds", () => {
    const r = foldKidsMenuReport("2026-10-27", {
      reached: 40,
      opened: 10,
      opened_finished: 8,
      opened_won: 6,
      unopened_finished: 25,
      unopened_won: 5,
      menu_orders: 9,
      peeks: 12,
    });
    expect(r.opened).toMatchObject({ pct: 25, of: 40 });
    expect(r.wonAfterOpen).toMatchObject({ pct: 75, of: 8 });
    expect(r.wonWithout).toMatchObject({ pct: 20, of: 25 });
    expect(r.openedCount).toBe(10);
  });
});
