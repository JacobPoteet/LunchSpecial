import { describe, expect, it } from "vitest";
import type { DishRecord } from "./game";
import { computeFeedback, fallbackDishIndex, isAllowedRequestDate, isValidDateString, puzzleNumber } from "./game";

const carbonara: DishRecord = {
  id: 1,
  name: "Spaghetti Carbonara",
  country: "Italy",
  region: "europe",
  course: "entree",
  temperature: "hot",
  protein: "pork",
  ingredients: ["pasta", "egg", "pecorino", "guanciale", "black pepper"],
};

const ramen: DishRecord = {
  id: 38,
  name: "Ramen",
  country: "Japan",
  region: "east-asia",
  course: "entree",
  temperature: "hot",
  protein: "pork",
  ingredients: ["noodles", "pork", "egg", "scallion", "soy sauce", "miso", "seaweed", "garlic"],
};

const croque: DishRecord = {
  id: 6,
  name: "Croque Monsieur",
  country: "France",
  region: "europe",
  course: "entree",
  temperature: "hot",
  protein: "pork",
  ingredients: ["bread", "ham", "gruyere", "butter", "milk", "flour", "mustard"],
};

describe("computeFeedback", () => {
  it("marks the exact dish correct with all ingredients matched", () => {
    const fb = computeFeedback(carbonara, carbonara);
    expect(fb.correct).toBe(true);
    expect(fb.matchedIngredients).toEqual(carbonara.ingredients);
    expect(fb.unmatchedIngredients).toEqual([]);
    expect(fb.attributes.country.match).toBe("hit");
  });

  it("computes ingredient intersection", () => {
    const fb = computeFeedback(ramen, carbonara);
    expect(fb.correct).toBe(false);
    expect(fb.matchedIngredients).toEqual(["egg"]);
    expect(fb.unmatchedIngredients).toContain("noodles");
    expect(fb.unmatchedIngredients).not.toContain("egg");
  });

  it("scores country near when regions match but countries differ", () => {
    const fb = computeFeedback(croque, carbonara);
    expect(fb.attributes.country).toEqual({ value: "France", match: "near" });
    expect(fb.attributes.course.match).toBe("hit");
    expect(fb.attributes.protein.match).toBe("hit");
  });

  it("scores country miss across regions", () => {
    const fb = computeFeedback(ramen, croque);
    expect(fb.attributes.country.match).toBe("miss");
  });
});

describe("puzzleNumber", () => {
  it("is 1 on the epoch date and counts up", () => {
    expect(puzzleNumber("2026-07-17")).toBe(1);
    expect(puzzleNumber("2026-07-18")).toBe(2);
    expect(puzzleNumber("2026-08-16")).toBe(31);
  });
});

describe("date validation", () => {
  it("accepts real dates and rejects malformed or impossible ones", () => {
    expect(isValidDateString("2026-07-17")).toBe(true);
    expect(isValidDateString("2026-2-3")).toBe(false);
    expect(isValidDateString("2026-02-31")).toBe(false);
    expect(isValidDateString("not-a-date")).toBe(false);
  });

  it("accepts dates within a day of now and rejects distant ones", () => {
    const now = new Date("2026-07-17T12:00:00Z");
    expect(isAllowedRequestDate("2026-07-17", now)).toBe(true);
    expect(isAllowedRequestDate("2026-07-18", now)).toBe(true);
    expect(isAllowedRequestDate("2026-07-16", now)).toBe(true);
    expect(isAllowedRequestDate("2026-07-25", now)).toBe(false);
    expect(isAllowedRequestDate("2025-01-01", now)).toBe(false);
  });
});

describe("fallbackDishIndex", () => {
  it("is deterministic and in range", () => {
    const a = fallbackDishIndex("2026-09-01", 68);
    expect(a).toBe(fallbackDishIndex("2026-09-01", 68));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(68);
    // Different dates should generally land on different dishes.
    expect(fallbackDishIndex("2026-09-02", 68)).not.toBe(fallbackDishIndex("2026-09-03", 68));
  });
});
