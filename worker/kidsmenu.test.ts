import { describe, expect, it } from "vitest";
import type { Course, Dish, Protein, Region, Temperature } from "../shared/types";
import {
  buildMenu,
  foldKidsMenuReport,
  parseGuessed,
  pooledDifference,
  sizeGroup,
  type BoardGuessRow,
  type KidsMenuInput,
  type PoolDishRow,
  type ReachedRoundRow,
} from "./kidsmenu";

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
  it("reads the board off the guessed dishes against the target", () => {
    const menu = buildMenu(pool, board, ids, ramen)!;
    expect(menu.filters).toEqual([
      { fact: "region", value: "east-asia" },
      { fact: "protein", value: "pork" },
    ]);
    expect(menu.dishes).toHaveLength(10);
    expect(menu.dishes.map((d) => d.id)).toContain(ramen.id);
  });

  it("leaves off a dish from the near country itself", () => {
    // Mapo Tofu came near from China, so the Special is East Asian but not Chinese.
    const charSiu = dish("Char Siu", "China", "east-asia", "entree", "hot", "pork");
    const menu = buildMenu([...pool, charSiu], board, ids, ramen)!;
    expect(menu.dishes.map((d) => d.name)).not.toContain("Char Siu");
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

describe("sizeGroup", () => {
  it("files a card size under the readout's groups, the last open-ended", () => {
    expect([1, 2, 3, 4, 6, 7, 12, 13, 300].map(sizeGroup)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe("pooledDifference", () => {
  it("is null with no group holding both sides", () => {
    expect(pooledDifference([{ a: { won: 3, of: 3 }, b: { won: 0, of: 0 } }])).toBeNull();
  });

  it("weights each group by its smaller side, not by its rates", () => {
    // A big group at +0 and a tiny one at +100: the pooled gap stays near zero.
    const d = pooledDifference([
      { a: { won: 50, of: 100 }, b: { won: 50, of: 100 } },
      { a: { won: 1, of: 1 }, b: { won: 0, of: 1 } },
    ])!;
    expect(d.pts).toBe(1);
    expect(d.low).toBeLessThan(0);
    expect(d.high).toBeGreaterThan(0);
  });

  it("keeps a spread on a group at all-or-nothing", () => {
    const d = pooledDifference([{ a: { won: 3, of: 3 }, b: { won: 0, of: 3 } }])!;
    expect(d.pts).toBe(100);
    expect(d.low).toBeLessThan(100);
  });
});

describe("foldKidsMenuReport", () => {
  // The pool as rows: Ramen is the Special, and four misses leave ten East
  // Asian pork dishes on the card (the buildMenu board above).
  const asRow = (d: Dish, created_at = "2026-01-01 00:00:00"): PoolDishRow => ({
    id: d.id,
    country: d.country,
    region: d.region,
    course: d.course,
    temperature: d.temperature,
    protein: d.protein,
    is_active: d.isActive ? 1 : 0,
    created_at,
  });
  const dishes = [...pool, ...board].map((d) => asRow(d));
  const ledger = (round_id: string, at = 4): BoardGuessRow[] =>
    board
      .slice(0, at)
      .map((d, i) => ({ round_id, guess_number: i + 1, guessed_dish_id: d.id, target_dish_id: ramen.id }));
  const round = (round_id: string, over: Partial<ReachedRoundRow> = {}): ReachedRoundRow => ({
    round_id,
    player_id: `p-${round_id}`,
    started_at: "2026-10-28 12:00:00",
    completed: 1,
    solved: 0,
    kids_menu_at: null,
    ...over,
  });
  const input = (over: Partial<KidsMenuInput> = {}): KidsMenuInput => ({
    rounds: [],
    guesses: [],
    opens: [],
    dishes,
    orders: { n: 0, hits: 0 },
    ...over,
  });
  const open = (round_id: string, at_guess: number, dishes: number, opened_at = "2026-10-28 12:05:00") => ({
    round_id,
    at_guess,
    dishes,
    opened_at,
  });

  it("is unmeasured, not zero, before the first flagged guess", () => {
    const r = foldKidsMenuReport(null, null);
    expect(r.measuredFrom).toBeNull();
    expect(r.opened).toBeNull();
    expect(r.cards).toBeNull();
    expect(r.likeBoards.difference).toBeNull();
  });

  it("rates the open over rounds that reached a fourth miss, and the win over finished rounds", () => {
    const rounds = [
      round("a", { kids_menu_at: 4, solved: 1 }),
      round("b", { kids_menu_at: 4 }),
      round("c", { solved: 1 }),
      round("d"),
      round("e", { completed: 0, solved: null, player_id: "p-a" }),
    ];
    const r = foldKidsMenuReport("2026-10-27", input({ rounds, orders: { n: 4, hits: 1 } }));
    expect(r.reached).toBe(5);
    expect(r.reachedDevices).toBe(4);
    expect(r.opened).toMatchObject({ pct: 40, of: 5 });
    expect(r.wonAfterOpen).toMatchObject({ pct: 50, of: 2 });
    expect(r.wonWithout).toMatchObject({ pct: 50, of: 2 });
    expect(r.orderHits).toMatchObject({ pct: 25, of: 4 });
  });

  it("rebuilds the card every round would have printed, opened or not, and groups them", () => {
    const rounds = [round("a", { kids_menu_at: 4, solved: 1 }), round("b")];
    const guesses = [...ledger("a"), ...ledger("b")];
    const r = foldKidsMenuReport("2026-10-27", input({ rounds, guesses, opens: [open("a", 4, 10)] }));
    const group = sizeGroup(10);
    expect(r.likeBoards.rows[group].opened).toMatchObject({ pct: 100, of: 1 });
    expect(r.likeBoards.rows[group].without).toMatchObject({ pct: 0, of: 1 });
    expect(r.likeBoards.agreement).toEqual({ n: 1, of: 1 });
    expect(r.likeBoards.difference?.pts).toBe(100);
  });

  it("counts a round with a hole in its ledger apart, never in a group", () => {
    const r = foldKidsMenuReport("2026-10-27", input({ rounds: [round("a")], guesses: ledger("a", 3) }));
    expect(r.likeBoards.unmeasured).toBe(1);
    expect(r.likeBoards.rows.every((row) => row.without === null)).toBe(true);
  });

  it("rebuilds the pool as of the round's start", () => {
    // Two dishes that would fit: one added after the round started, one parked.
    const late = asRow(dish("Late Pork", "Korea", "east-asia", "entree", "hot", "pork"), "2026-10-29 00:00:00");
    const parked = asRow(dish("Parked Pork", "Korea", "east-asia", "entree", "hot", "pork", ["salt"], false));
    const r = foldKidsMenuReport(
      "2026-10-27",
      input({ rounds: [round("a", { kids_menu_at: 4 })], guesses: ledger("a"), opens: [open("a", 4, 10)], dishes: [...dishes, late, parked] }),
    );
    expect(r.likeBoards.agreement).toEqual({ n: 1, of: 1 });
  });

  it("sets wins off the card beside a blind pick off the same cards", () => {
    // Ten on the card, two guesses left: blind wins 20%.
    const rounds = [round("a", { kids_menu_at: 4, solved: 1 }), round("b", { kids_menu_at: 4 })];
    const r = foldKidsMenuReport("2026-10-27", input({ rounds, opens: [open("a", 4, 10), open("b", 4, 10)] }));
    expect(r.chance.won).toMatchObject({ pct: 50, of: 2 });
    expect(r.chance.blindPct).toBe(20);
  });

  it("falls back to the rebuilt card for an open with no size on file", () => {
    const r = foldKidsMenuReport("2026-10-27", input({ rounds: [round("a", { kids_menu_at: 4 })], guesses: ledger("a") }));
    expect(r.chance.won).toMatchObject({ of: 1 });
    expect(r.chance.blindPct).toBe(20);
  });

  it("draws card sizes off each round's first open, and counts the reopens", () => {
    const opens = [
      open("a", 4, 9),
      open("a", 5, 2, "2026-10-28 12:07:00"),
      open("b", 4, 1, "2026-10-29 12:05:00"),
      open("c", 5, 3, "2026-10-29 13:05:00"),
    ];
    const r = foldKidsMenuReport("2026-10-27", input({ opens }));
    expect(r.cards).toMatchObject({ measuredFrom: "2026-10-28", opens: 3, median: 3, p90: 9, reopened: 1 });
    expect(r.cards?.sizes).toEqual([1, 1, 0, 1, 0]);
  });
});
