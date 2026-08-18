import { describe, expect, it } from "vitest";
import { pickUnserved, unservedDishes, type ShuffleDishRow } from "./shuffle";

const row = (over: Partial<ShuffleDishRow> = {}): ShuffleDishRow => ({
  id: 1,
  name: "Ramen",
  ingredients: JSON.stringify(["noodle", "pork", "egg", "scallion"]),
  clue_count: 5,
  ever_scheduled: 0,
  ...over,
});

describe("unservedDishes", () => {
  it("keeps a complete dish that has never been scheduled", () => {
    expect(unservedDishes([row()])).toEqual([{ id: 1, name: "Ramen" }]);
  });

  it("drops anything that has ever held a schedule row", () => {
    // Booked-for-next-week counts as spent: rolling it onto tomorrow would serve
    // it twice and leave a hole where it was.
    expect(unservedDishes([row({ ever_scheduled: 1 })])).toEqual([]);
  });

  it("drops dishes the schedule endpoint would refuse anyway", () => {
    const short = row({ id: 2, ingredients: JSON.stringify(["rice", "egg"]) });
    const clueless = row({ id: 3, clue_count: 4 });
    expect(unservedDishes([short, clueless])).toEqual([]);
  });

  it("drops a dish whose ingredients aren't a JSON array", () => {
    expect(unservedDishes([row({ ingredients: "not json" }), row({ id: 2, ingredients: '"rice"' })])).toEqual([]);
  });

  it("orders by id so the pick doesn't depend on D1's row order", () => {
    const pool = unservedDishes([row({ id: 9, name: "C" }), row({ id: 2, name: "A" }), row({ id: 5, name: "B" })]);
    expect(pool.map((d) => d.name)).toEqual(["A", "B", "C"]);
  });
});

describe("pickUnserved", () => {
  const pool = [
    { id: 1, name: "A" },
    { id: 2, name: "B" },
    { id: 3, name: "C" },
  ];

  it("returns null when nothing is left to roll", () => {
    expect(pickUnserved([], 0.5)).toBeNull();
  });

  it("maps the roll evenly across the pool", () => {
    expect(pickUnserved(pool, 0)?.name).toBe("A");
    expect(pickUnserved(pool, 0.5)?.name).toBe("B");
    expect(pickUnserved(pool, 0.99)?.name).toBe("C");
  });

  it("never rolls off the end", () => {
    expect(pickUnserved(pool, 1)?.name).toBe("C");
    expect(pickUnserved(pool, 42)?.name).toBe("C");
    expect(pickUnserved(pool, -1)?.name).toBe("A");
    expect(pickUnserved(pool, Number.NaN)?.name).toBe("A");
  });
});
