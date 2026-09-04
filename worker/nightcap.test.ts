import { describe, expect, it } from "vitest";
import { compareDrinkAttributes, computeDrinkFeedback, type DrinkRecord } from "./nightcap";

const drink = (over: Partial<DrinkRecord> = {}): DrinkRecord => ({
  id: 1,
  name: "Negroni",
  country: "Italy",
  region: "europe",
  spirit: "gin",
  temperature: "cold",
  profile: "bitter",
  ingredients: ["gin", "vermouth", "campari", "orange", "ice"],
  ...over,
});

describe("compareDrinkAttributes", () => {
  it("calls the same country a hit", () => {
    const target = drink();
    const guess = drink({ id: 2, name: "Bellini", country: "Italy", spirit: "wine" });
    expect(compareDrinkAttributes(guess, target).country.match).toBe("hit");
  });

  it("calls a different country in the same region a near", () => {
    // The one three-state tile, exactly as on a dish.
    const guess = drink({ id: 2, name: "Sidecar", country: "France", region: "europe" });
    expect(compareDrinkAttributes(guess, drink()).country.match).toBe("near");
  });

  it("calls another region a miss", () => {
    const guess = drink({ id: 2, name: "Margarita", country: "Mexico", region: "latin-america" });
    expect(compareDrinkAttributes(guess, drink()).country.match).toBe("miss");
  });

  it("treats a spiritless drink as a value, not a special case", () => {
    // 'none' means no base spirit, so two mocktails match each other. Nothing
    // here knows or cares whether either is alcoholic.
    const target = drink({ spirit: "none" });
    const guess = drink({ id: 2, spirit: "none" });
    expect(compareDrinkAttributes(guess, target).spirit.match).toBe("hit");
  });

  it("scores spirit, temperature and profile as plain hit or miss", () => {
    const target = drink({ spirit: "gin", temperature: "cold", profile: "bitter" });
    const guess = drink({ id: 2, spirit: "rum", temperature: "hot", profile: "sweet" });
    const a = compareDrinkAttributes(guess, target);
    expect([a.spirit.match, a.temperature.match, a.profile.match]).toEqual(["miss", "miss", "miss"]);
    // Never "near" — only country has a middle state, because only country has
    // a bucket to be near within.
    expect(Object.values(a).every((t) => t.match !== "near" || t === a.country)).toBe(true);
  });

  it("reports the guess's own values, not the target's", () => {
    const a = compareDrinkAttributes(drink({ id: 2, spirit: "rum", country: "Cuba" }), drink());
    expect(a.spirit.value).toBe("rum");
    expect(a.country.value).toBe("Cuba");
  });
});

describe("computeDrinkFeedback", () => {
  it("splits the guess's ingredients by what the target shares", () => {
    const target = drink({ ingredients: ["gin", "vermouth", "campari"] });
    const guess = drink({ id: 2, name: "Martini", ingredients: ["gin", "vermouth", "olive"] });
    const fb = computeDrinkFeedback(guess, target);
    expect(fb.matchedIngredients).toEqual(["gin", "vermouth"]);
    expect(fb.unmatchedIngredients).toEqual(["olive"]);
  });

  it("is correct only on the same drink id", () => {
    // Two drinks could share every attribute; the id is the answer.
    const target = drink();
    expect(computeDrinkFeedback(drink(), target).correct).toBe(true);
    expect(computeDrinkFeedback(drink({ id: 2 }), target).correct).toBe(false);
  });

  it("names the guessed drink, never the target", () => {
    const fb = computeDrinkFeedback(drink({ id: 2, name: "Sidecar" }), drink({ name: "Negroni" }));
    expect(fb.drink).toEqual({ id: 2, name: "Sidecar" });
    expect(JSON.stringify(fb)).not.toContain("Negroni");
  });

  it("hands back no coaster of its own", () => {
    // The coaster is a database read the route does, so the fold must leave the
    // field absent rather than inventing an empty one.
    expect("coaster" in computeDrinkFeedback(drink({ id: 2 }), drink())).toBe(false);
  });
});
