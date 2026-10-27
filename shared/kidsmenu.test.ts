import { describe, expect, it } from "vitest";
import {
  boardMenu,
  confirmedFacts,
  filterLabel,
  fitsBoard,
  kidsMenuIntroDue,
  kidsMenuOpen,
  layoutMenu,
  MENU_AFTER,
  MENU_FLAT_MAX,
  MENU_OPEN_MAX,
  type MenuTraits,
} from "./kidsmenu";
import type { Course, Protein, Region, Temperature } from "./types";

interface D extends MenuTraits {
  id: number;
  name: string;
  country: string;
}

let nextId = 1;
const dish = (
  name: string,
  country: string,
  region: Region,
  course: Course = "entree",
  temperature: Temperature = "hot",
  protein: Protein = "beef",
): D => ({ id: nextId++, name, country, region, course, temperature, protein });

/** n dishes sharing the given traits, named so they sort predictably. */
const many = (n: number, prefix: string, traits: Partial<D>): D[] =>
  Array.from({ length: n }, (_, i) => ({ ...dish(`${prefix} ${String(i).padStart(2, "0")}`, "X", "europe"), ...traits }));

const ramen = dish("Ramen", "Japan", "east-asia", "entree", "hot", "pork");

describe("fitsBoard", () => {
  it("keeps only the guess's country after a country hit", () => {
    const board = [dish("Sushi", "Japan", "east-asia", "dessert", "cold", "seafood")];
    expect(fitsBoard(dish("Katsu", "Japan", "east-asia", "entree", "hot", "pork"), ramen, board)).toBe(true);
    expect(fitsBoard(dish("Mapo", "China", "east-asia", "entree", "hot", "pork"), ramen, board)).toBe(false);
  });

  it("keeps the region but drops the guess's own country after a near", () => {
    const board = [dish("Mapo Tofu", "China", "east-asia", "dessert", "cold", "vegetarian")];
    expect(fitsBoard(dish("Bulgogi", "South Korea", "east-asia", "entree", "hot", "pork"), ramen, board)).toBe(true);
    expect(fitsBoard(dish("Char Siu", "China", "east-asia", "entree", "hot", "pork"), ramen, board)).toBe(false);
    expect(fitsBoard(dish("Adobo", "Philippines", "southeast-asia", "entree", "hot", "pork"), ramen, board)).toBe(false);
  });

  it("drops the guess's whole region after a country miss", () => {
    // The reported bug: a North American miss left North America on the menu.
    const board = [dish("Hamburger", "United States", "north-america", "dessert", "cold", "vegetarian")];
    expect(fitsBoard(dish("Poutine", "Canada", "north-america", "entree", "hot", "pork"), ramen, board)).toBe(false);
    expect(fitsBoard(dish("Bulgogi", "South Korea", "east-asia", "entree", "hot", "pork"), ramen, board)).toBe(true);
  });

  it("keeps a hit tile's value and drops a missed one's", () => {
    const board = [dish("Pavlova", "Australia", "oceania", "entree", "cold", "beef")];
    // course hit (entree), temperature miss (cold), protein miss (beef)
    expect(fitsBoard(dish("A", "Japan", "east-asia", "entree", "hot", "pork"), ramen, board)).toBe(true);
    expect(fitsBoard(dish("B", "Japan", "east-asia", "dessert", "hot", "pork"), ramen, board)).toBe(false);
    expect(fitsBoard(dish("C", "Japan", "east-asia", "entree", "cold", "pork"), ramen, board)).toBe(false);
    expect(fitsBoard(dish("D", "Japan", "east-asia", "entree", "hot", "beef"), ramen, board)).toBe(false);
  });

  it("always keeps the Special", () => {
    const board = [
      dish("Pavlova", "Australia", "oceania", "dessert", "cold", "vegetarian"),
      dish("Mapo Tofu", "China", "east-asia", "entree", "hot", "vegetarian"),
      dish("Sushi", "Japan", "east-asia", "appetizer", "cold", "seafood"),
    ];
    expect(fitsBoard(ramen, ramen, board)).toBe(true);
  });
});

describe("confirmedFacts", () => {
  it("confirms nothing from a board of misses", () => {
    expect(confirmedFacts([dish("Taco", "Mexico", "latin-america", "appetizer", "cold", "beef")], ramen)).toEqual({});
  });

  it("confirms the region from a near and the country from a hit, never both", () => {
    expect(confirmedFacts([dish("Mapo", "China", "east-asia", "dessert", "cold", "beef")], ramen)).toEqual({
      region: "east-asia",
    });
    expect(
      confirmedFacts(
        [dish("Mapo", "China", "east-asia", "dessert", "cold", "beef"), dish("Sushi", "Japan", "east-asia", "dessert", "cold", "beef")],
        ramen,
      ),
    ).toEqual({ country: "Japan" });
  });

  it("confirms each other tile on a hit, from any guess", () => {
    const guesses = [
      dish("A", "France", "europe", "entree", "cold", "beef"),
      dish("B", "Peru", "latin-america", "dessert", "hot", "lamb"),
      dish("C", "Italy", "europe", "breakfast", "cold", "pork"),
    ];
    expect(confirmedFacts(guesses, ramen)).toEqual({ course: "entree", temperature: "hot", protein: "pork" });
  });
});

describe("filterLabel", () => {
  it("names a region the way a near tile does, and the rest as the tile's value", () => {
    expect(filterLabel("region", "east-asia")).toBe("East Asia");
    expect(filterLabel("country", "Japan")).toBe("Japan");
    expect(filterLabel("protein", "pork")).toBe("pork");
  });
});

describe("boardMenu", () => {
  const board = [
    dish("Pavlova", "Australia", "oceania", "dessert", "cold", "vegetarian"),
    dish("Gazpacho", "Spain", "europe", "appetizer", "cold", "vegetarian"),
    dish("Ceviche", "Peru", "latin-america", "appetizer", "cold", "seafood"),
    dish("Tiramisu", "Italy", "europe", "dessert", "cold", "vegetarian"),
    dish("Hamburger", "United States", "north-america", "entree", "hot", "beef"),
  ];
  const pool = [
    ramen,
    dish("Bulgogi", "South Korea", "east-asia", "entree", "hot", "pork"),
    dish("Poutine", "Canada", "north-america", "entree", "hot", "pork"),
    dish("Paella", "Spain", "europe", "entree", "hot", "pork"),
    dish("Butter Chicken", "India", "south-asia", "entree", "hot", "poultry"),
    dish("Bao", "China", "east-asia", "appetizer", "hot", "pork"),
    dish("Chili", "Mexico", "latin-america", "entree", "hot", "pork"),
  ];

  it("lists only what every tile still allows, by name, with no floor", () => {
    const menu = boardMenu(pool, ramen, board);
    expect(menu.dishes.map((d) => d.name)).toEqual(["Bulgogi", "Butter Chicken", "Ramen"]);
    expect(menu.filters).toEqual(["course", "temperature"]);
  });

  it("can come down to the Special alone, which the board already proved", () => {
    const tight = [...board.slice(0, 4), dish("Bibimbap", "South Korea", "east-asia", "entree", "hot", "pork")];
    expect(boardMenu(pool, ramen, tight).dishes.map((d) => d.name)).toEqual(["Ramen"]);
  });

  it("stamps the country, not the region, once a country tile hit", () => {
    const menu = boardMenu(pool, ramen, [dish("Sushi", "Japan", "east-asia", "appetizer", "cold", "seafood")]);
    expect(menu.filters).toEqual(["country"]);
    expect(menu.known.country).toBe("Japan");
  });
});

describe("layoutMenu", () => {
  it("prints a short menu as one list", () => {
    const layout = layoutMenu(many(MENU_FLAT_MAX, "Dish", {}), []);
    expect(layout.sections).toHaveLength(1);
    expect(layout.sections[0].course).toBeNull();
    expect(layout.folded).toBe(false);
  });

  it("sections a longer one by course in the fixed order, open", () => {
    const dishes = [...many(12, "Dessert", { course: "dessert" }), ...many(12, "Breakfast", { course: "breakfast" })];
    const layout = layoutMenu(dishes, []);
    expect(layout.sections.map((s) => s.course)).toEqual(["breakfast", "dessert"]);
    expect(layout.sections.map((s) => s.count)).toEqual([12, 12]);
    expect(layout.folded).toBe(false);
  });

  it("folds sections past the open limit", () => {
    expect(layoutMenu(many(MENU_OPEN_MAX + 1, "Dish", {}), []).folded).toBe(true);
    expect(layoutMenu(many(MENU_OPEN_MAX, "Dish", {}), []).folded).toBe(false);
  });

  it("splits a long section by region unless region is a filter", () => {
    const dishes = [
      ...many(20, "Euro", { region: "europe" }),
      ...many(15, "Africa", { region: "africa" }),
      ...many(3, "Asia", { region: "east-asia" }),
    ];
    const split = layoutMenu(dishes, []);
    expect(split.sections[0].groups.map((g) => g.region)).toEqual(["europe", "africa", "east-asia"]);
    const whole = layoutMenu(dishes, ["region"]);
    expect(whole.sections[0].groups.map((g) => g.region)).toEqual([null]);
    expect(layoutMenu(dishes, ["country"]).sections[0].groups.map((g) => g.region)).toEqual([null]);
  });
});

describe("the pill", () => {
  it("appears from the fourth miss while the round is playing", () => {
    expect(MENU_AFTER).toBe(4);
    expect(kidsMenuOpen("playing", 3)).toBe(false);
    expect(kidsMenuOpen("playing", 4)).toBe(true);
    expect(kidsMenuOpen("playing", 5)).toBe(true);
    expect(kidsMenuOpen("won", 5)).toBe(false);
    expect(kidsMenuOpen("lost", 6)).toBe(false);
  });

  it("coaches once, the first time it could be opened", () => {
    expect(kidsMenuIntroDue({ seen: false, status: "playing", guesses: 4 })).toBe(true);
    expect(kidsMenuIntroDue({ seen: true, status: "playing", guesses: 4 })).toBe(false);
    expect(kidsMenuIntroDue({ seen: false, status: "playing", guesses: 3 })).toBe(false);
  });
});
