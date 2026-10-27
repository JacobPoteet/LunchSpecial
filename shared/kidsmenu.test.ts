import { describe, expect, it } from "vitest";
import {
  filterLabel,
  kidsMenuIntroDue,
  kidsMenuOpen,
  knownFacts,
  layoutMenu,
  MENU_AFTER,
  MENU_FLAT_MAX,
  MENU_FLOOR,
  MENU_OPEN_MAX,
  sizeMenu,
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

describe("knownFacts", () => {
  const target = dish("Ramen", "Japan", "east-asia", "entree", "hot", "pork");

  it("knows nothing from a board of misses", () => {
    expect(knownFacts([dish("Taco", "Mexico", "latin-america", "appetizer", "cold", "beef")], target)).toEqual({});
  });

  it("earns region from a near or a hit country tile", () => {
    expect(knownFacts([dish("Pho", "Vietnam", "southeast-asia", "dessert", "cold", "beef")], target)).toEqual({});
    expect(knownFacts([dish("Mapo", "China", "east-asia", "dessert", "cold", "beef")], target)).toEqual({
      region: "east-asia",
    });
    expect(knownFacts([dish("Sushi", "Japan", "east-asia", "dessert", "cold", "beef")], target)).toEqual({
      region: "east-asia",
    });
  });

  it("earns each other tile only on a hit, and keeps what any guess earned", () => {
    const guesses = [
      dish("A", "France", "europe", "entree", "cold", "beef"),
      dish("B", "Peru", "latin-america", "dessert", "hot", "lamb"),
      dish("C", "Italy", "europe", "breakfast", "cold", "pork"),
    ];
    expect(knownFacts(guesses, target)).toEqual({ course: "entree", temperature: "hot", protein: "pork" });
  });
});

describe("filterLabel", () => {
  it("names a region the way a near tile does, and the rest as the tile's value", () => {
    expect(filterLabel("region", "east-asia")).toBe("East Asia");
    expect(filterLabel("protein", "pork")).toBe("pork");
  });
});

describe("sizeMenu", () => {
  it("prints the whole pool, unfiltered, when nothing is known", () => {
    const pool = many(12, "Dish", {});
    const menu = sizeMenu(pool, {});
    expect(menu.filters).toEqual([]);
    expect(menu.dishes).toHaveLength(12);
  });

  it("takes the smallest set that still holds the floor", () => {
    const pool = [
      ...many(8, "Asia pork", { region: "east-asia", protein: "pork" }),
      ...many(20, "Asia beef", { region: "east-asia", protein: "beef" }),
      ...many(30, "Euro pork", { region: "europe", protein: "pork" }),
    ];
    const menu = sizeMenu(pool, { region: "east-asia", protein: "pork" });
    expect(menu.filters).toEqual(["region", "protein"]);
    expect(menu.dishes).toHaveLength(8);
  });

  it("drops a filter when using every fact would go under the floor", () => {
    const pool = [
      ...many(3, "Asia pork", { region: "east-asia", protein: "pork" }),
      ...many(9, "Asia beef", { region: "east-asia", protein: "beef" }),
      ...many(40, "Euro pork", { region: "europe", protein: "pork" }),
    ];
    const menu = sizeMenu(pool, { region: "east-asia", protein: "pork" });
    expect(menu.filters).toEqual(["region"]);
    expect(menu.dishes).toHaveLength(12);
  });

  it("breaks a tie toward fewer filters", () => {
    // Every Asian dish here is hot, so region alone and region + temperature
    // print the same ten. The chip line should say only what narrowed it.
    const pool = [...many(10, "Asia", { region: "east-asia", temperature: "hot" }), ...many(10, "Euro", { temperature: "cold" })];
    const menu = sizeMenu(pool, { region: "east-asia", temperature: "hot" });
    expect(menu.filters).toEqual(["region"]);
  });

  it("never uses a fact the board hasn't earned", () => {
    // Pork would cut the menu to eight, but the board has never hit protein.
    const pool = [
      ...many(8, "Asia pork", { region: "east-asia", protein: "pork" }),
      ...many(30, "Asia beef", { region: "east-asia" }),
      ...many(20, "Euro", { region: "europe" }),
    ];
    const menu = sizeMenu(pool, { region: "east-asia" });
    expect(menu.filters).toEqual(["region"]);
    expect(menu.dishes).toHaveLength(38);
  });

  it("sorts by name whatever order the pool came in", () => {
    const pool = ["Zuppa", "árepa", "Borscht", "Arancini", "Moussaka", "Crêpe", "Eclair", "Dal"].map((n) =>
      dish(n, "X", "europe"),
    );
    expect(sizeMenu(pool.reverse(), {}).dishes.map((d) => d.name)).toEqual([
      "Arancini",
      "árepa",
      "Borscht",
      "Crêpe",
      "Dal",
      "Eclair",
      "Moussaka",
      "Zuppa",
    ]);
  });

  it("falls back to the whole pool when even that is under the floor", () => {
    const menu = sizeMenu(many(3, "Tiny", {}), { region: "europe" });
    expect(menu.filters).toEqual([]);
    expect(menu.dishes).toHaveLength(3);
    expect(MENU_FLOOR).toBe(8);
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
