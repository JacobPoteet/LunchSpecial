import { describe, expect, it } from "vitest";
import {
  countActiveFilters,
  EMPTY_DISH_FILTER,
  facetCounts,
  filterDishes,
  menuStatusesOf,
  normalizeFilter,
  readinessOf,
  restDays,
  selectDishes,
  sortDishes,
  toggleFacet,
  type DishFilter,
} from "./dishfilter";
import type { AdminDishRow } from "./types";

const TODAY = "2026-08-24";

let nextId = 1;
function dish(over: Partial<AdminDishRow> = {}): AdminDishRow {
  const id = over.id ?? nextId++;
  return {
    id,
    name: `Dish ${id}`,
    slug: `dish-${id}`,
    country: "Italy",
    region: "europe",
    course: "entree",
    temperature: "hot",
    protein: "vegetarian",
    ingredients: ["tomato", "olive oil", "basil"],
    isActive: true,
    isFanSubmission: false,
    clueCount: 5,
    lastServed: null,
    nextBooked: null,
    timesServed: 0,
    schedulable: true,
    ...over,
  };
}

const filter = (over: Partial<DishFilter> = {}): DishFilter => ({ ...EMPTY_DISH_FILTER, ...over });
const names = (rows: AdminDishRow[]) => rows.map((r) => r.name);

describe("menuStatusesOf", () => {
  it("calls a dish with no schedule row at all 'never'", () => {
    expect(menuStatusesOf(dish())).toEqual(["never"]);
  });

  it("holds both when a dish was served and is booked again", () => {
    expect(menuStatusesOf(dish({ lastServed: "2026-07-20", nextBooked: "2026-09-01" }))).toEqual([
      "served",
      "booked",
    ]);
  });

  it("counts a booked-but-never-served dish as spoken for, not as never", () => {
    // The shuffle's rule: a future booking is not "unserved and available".
    expect(menuStatusesOf(dish({ nextBooked: "2026-09-01" }))).toEqual(["booked"]);
  });
});

describe("readinessOf", () => {
  it("puts inactive ahead of schedulability", () => {
    expect(readinessOf(dish({ isActive: false, schedulable: true }))).toBe("inactive");
    expect(readinessOf(dish({ schedulable: false }))).toBe("incomplete");
    expect(readinessOf(dish())).toBe("ready");
  });
});

describe("restDays", () => {
  it("measures whole days back to the last serving", () => {
    expect(restDays(dish({ lastServed: "2026-08-17" }), TODAY)).toBe(7);
  });

  it("is null — not zero — for a dish that has never been the Special", () => {
    expect(restDays(dish(), TODAY)).toBeNull();
  });
});

describe("filterDishes", () => {
  it("matches every search term across name, country and ingredients", () => {
    const rows = [
      dish({ name: "Ramen", country: "Japan", ingredients: ["pork", "noodle"] }),
      dish({ name: "Pad Thai", country: "Thailand", ingredients: ["noodle", "peanut"] }),
    ];
    expect(names(filterDishes(rows, filter({ query: "noodle" }), TODAY))).toEqual(["Ramen", "Pad Thai"]);
    expect(names(filterDishes(rows, filter({ query: "japan noodle" }), TODAY))).toEqual(["Ramen"]);
    expect(filterDishes(rows, filter({ query: "japan peanut" }), TODAY)).toEqual([]);
  });

  it("ORs within a facet and ANDs across facets", () => {
    const rows = [
      dish({ name: "A", region: "europe", course: "dessert" }),
      dish({ name: "B", region: "east-asia", course: "dessert" }),
      dish({ name: "C", region: "east-asia", course: "entree" }),
    ];
    expect(names(filterDishes(rows, filter({ regions: ["europe", "east-asia"] }), TODAY))).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(
      names(filterDishes(rows, filter({ regions: ["europe", "east-asia"], courses: ["dessert"] }), TODAY)),
    ).toEqual(["A", "B"]);
  });

  it("treats never-served as passing any rest threshold", () => {
    const rows = [
      dish({ name: "Never" }),
      dish({ name: "Rested", lastServed: "2026-06-01" }),
      dish({ name: "Fresh", lastServed: "2026-08-20" }),
    ];
    expect(names(filterDishes(rows, filter({ restedDays: 60 }), TODAY))).toEqual(["Never", "Rested"]);
  });

  it("finds the unspoken-for dishes the shuffle would pick from", () => {
    const rows = [
      dish({ name: "Free" }),
      dish({ name: "Booked", nextBooked: "2026-09-02" }),
      dish({ name: "Served", lastServed: "2026-08-01" }),
    ];
    expect(names(filterDishes(rows, filter({ statuses: ["never"] }), TODAY))).toEqual(["Free"]);
  });
});

describe("facetCounts", () => {
  const rows = [
    dish({ name: "A", region: "europe", course: "dessert" }),
    dish({ name: "B", region: "east-asia", course: "dessert" }),
    dish({ name: "C", region: "east-asia", course: "entree" }),
  ];

  it("drops a facet's own selection so its numbers stay clickable", () => {
    const counts = facetCounts(rows, filter({ regions: ["europe"] }), TODAY);
    // Not 0: clicking east-asia (which replaces europe in a single-pick flow, or
    // widens it in a multi-pick one) is what the number is answering.
    expect(counts.regions["east-asia"]).toBe(2);
    expect(counts.regions.europe).toBe(1);
  });

  it("still applies every other facet", () => {
    const counts = facetCounts(rows, filter({ courses: ["dessert"] }), TODAY);
    expect(counts.regions.europe).toBe(1);
    expect(counts.regions["east-asia"]).toBe(1);
  });

  it("zero-fills the enums so chip rows keep a stable order", () => {
    const counts = facetCounts(rows, filter(), TODAY);
    expect(counts.proteins.lamb).toBe(0);
    expect(counts.courses.drink).toBe(0);
  });

  it("counts a dish under both of its statuses", () => {
    const counts = facetCounts([dish({ lastServed: "2026-08-01", nextBooked: "2026-09-01" })], filter(), TODAY);
    expect(counts.statuses.served).toBe(1);
    expect(counts.statuses.booked).toBe(1);
    expect(counts.statuses.never).toBe(0);
  });

  it("keeps a country in the picker even when nothing matches", () => {
    const counts = facetCounts(rows, filter({ query: "nothing-matches-this" }), TODAY);
    expect(counts.countries.Italy).toBe(0);
  });
});

describe("sortDishes", () => {
  const rows = [
    dish({ name: "Fresh", lastServed: "2026-08-20", timesServed: 3 }),
    dish({ name: "Never" }),
    dish({ name: "Old", lastServed: "2026-05-01", timesServed: 1 }),
  ];

  it("sorts never-served to the top of the booking order", () => {
    expect(names(sortDishes(rows, "rested", TODAY))).toEqual(["Never", "Old", "Fresh"]);
  });

  it("sinks never-served to the bottom of most-recent", () => {
    expect(names(sortDishes(rows, "recent", TODAY))).toEqual(["Fresh", "Old", "Never"]);
  });

  it("ranks by servings, then by rest", () => {
    expect(names(sortDishes(rows, "served", TODAY))).toEqual(["Fresh", "Old", "Never"]);
  });

  it("uses the id for newest-added and the name for A–Z", () => {
    const byId = [dish({ id: 5, name: "Five" }), dish({ id: 9, name: "Nine" })];
    expect(names(sortDishes(byId, "added", TODAY))).toEqual(["Nine", "Five"]);
    expect(names(sortDishes(rows, "name", TODAY))).toEqual(["Fresh", "Never", "Old"]);
  });

  it("does not mutate the array it was given", () => {
    const before = names(rows);
    sortDishes(rows, "rested", TODAY);
    expect(names(rows)).toEqual(before);
  });
});

describe("selectDishes", () => {
  it("filters then sorts", () => {
    const rows = [
      dish({ name: "Booked", region: "east-asia", nextBooked: "2026-09-01" }),
      dish({ name: "Free", region: "east-asia" }),
      dish({ name: "Elsewhere", region: "europe" }),
    ];
    const picked = selectDishes(rows, filter({ regions: ["east-asia"], sort: "rested" }), TODAY);
    expect(names(picked)).toEqual(["Booked", "Free"]);
  });
});

describe("countActiveFilters", () => {
  it("counts one per constraint and ignores the sort", () => {
    expect(countActiveFilters(filter({ sort: "rested" }))).toBe(0);
    expect(countActiveFilters(filter({ query: "  " }))).toBe(0);
    expect(countActiveFilters(filter({ query: "pie", regions: ["europe", "africa"], restedDays: 60 }))).toBe(3);
  });
});

describe("toggleFacet", () => {
  it("adds and removes, keeping the enum's order rather than click order", () => {
    const one = toggleFacet(filter(), "regions", "east-asia");
    const two = toggleFacet(one, "regions", "europe");
    expect(two.regions).toEqual(["europe", "east-asia"]);
    expect(toggleFacet(two, "regions", "europe").regions).toEqual(["east-asia"]);
  });

  it("sorts open-ended countries alphabetically", () => {
    const f = toggleFacet(toggleFacet(filter(), "countries", "Japan"), "countries", "Argentina");
    expect(f.countries).toEqual(["Argentina", "Japan"]);
  });
});

describe("normalizeFilter", () => {
  it("drops values outside the enums", () => {
    const f = normalizeFilter({ regions: ["europe", "atlantis", 7], courses: ["entree"], sort: "sideways" });
    expect(f.regions).toEqual(["europe"]);
    expect(f.courses).toEqual(["entree"]);
    expect(f.sort).toBe(EMPTY_DISH_FILTER.sort);
  });

  it("accepts only the rest presets", () => {
    expect(normalizeFilter({ restedDays: 60 }).restedDays).toBe(60);
    expect(normalizeFilter({ restedDays: 45 }).restedDays).toBeNull();
  });

  it("survives junk", () => {
    expect(normalizeFilter(null)).toEqual(EMPTY_DISH_FILTER);
    expect(normalizeFilter("nope")).toEqual(EMPTY_DISH_FILTER);
  });
});
