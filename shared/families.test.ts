import { describe, expect, it } from "vitest";
import {
  classify,
  FAMILIES,
  FAMILY_GROUPS,
  familyOf,
  groupOf,
  nearIngredients,
  nearRate,
  STANDALONE,
  STAPLES,
} from "./families";

describe("the family tables", () => {
  const everyMember = Object.values(FAMILIES).flat();

  it("gives every ingredient one home", () => {
    // A second home would make "same family" depend on which way round you ask.
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const [family, members] of Object.entries(FAMILIES)) {
      for (const m of members) {
        if (seen.has(m)) twice.push(`${m}: ${seen.get(m)} and ${family}`);
        seen.set(m, family);
      }
    }
    expect(twice).toEqual([]);
  });

  it("keeps staples and standalones out of the families, and out of each other", () => {
    const families = new Set(everyMember);
    expect(STAPLES.filter((s) => families.has(s))).toEqual([]);
    expect(STANDALONE.filter((s) => families.has(s))).toEqual([]);
    expect(STANDALONE.filter((s) => STAPLES.includes(s))).toEqual([]);
    expect(new Set(STANDALONE).size).toBe(STANDALONE.length);
  });

  it("gives a family at least two members, or it could never be close to anything", () => {
    const lonely = Object.entries(FAMILIES).filter(([, m]) => m.length < 2).map(([f]) => f);
    expect(lonely).toEqual([]);
  });

  it("keeps ingredients in the catalogue's spelling: lowercase, trimmed", () => {
    const bad = [...everyMember, ...STAPLES, ...STANDALONE].filter((i) => i !== i.trim().toLowerCase());
    expect(bad).toEqual([]);
  });

  it("colours exactly the families that exist", () => {
    const grouped = Object.values(FAMILY_GROUPS).flat();
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(Object.keys(FAMILIES).sort());
    expect(groupOf("citrus")).toBe("Fruit & nut");
    expect(groupOf("nonsense")).toBeNull();
  });
});

describe("classify and familyOf", () => {
  it("tells the four kinds of ingredient apart", () => {
    expect(classify("pasta")).toBe("family");
    expect(classify("onion")).toBe("staple");
    expect(classify("vanilla")).toBe("standalone");
    expect(classify("a brand-new ingredient")).toBe("unclassified");
  });

  it("gives a staple no family even where a list would otherwise place it", () => {
    expect(familyOf("onion")).toBeNull();
    expect(familyOf("scallion")).toBe("allium");
    expect(familyOf("vanilla")).toBeNull();
    expect(familyOf("a brand-new ingredient")).toBeNull();
  });
});

describe("nearIngredients", () => {
  const padThai = ["noodles", "shrimp", "egg", "peanuts", "bean sprouts", "tamarind", "fish sauce", "lime", "tofu"];
  const scampi = ["shrimp", "garlic", "butter", "white wine", "lemon", "parsley", "pasta"];

  it("calls pasta and noodles, lemon and lime, cousins: the complaint that started this", () => {
    expect(nearIngredients(padThai, scampi)).toEqual([
      { ingredient: "noodles", family: "noodle & pasta" },
      { ingredient: "lime", family: "citrus" },
    ]);
  });

  it("is symmetric in how many cousins it finds", () => {
    expect(nearIngredients(scampi, padThai).map((n) => n.ingredient)).toEqual(["lemon", "pasta"]);
  });

  it("never lets an exact match be somebody's cousin as well", () => {
    // lime matches lime exactly, so the Special's lemon has nothing left for the guess's lime to be close to.
    expect(nearIngredients(["lime", "lemon"], ["lime", "orange"])).toEqual([
      { ingredient: "lemon", family: "citrus" },
    ]);
    expect(nearIngredients(["lime"], ["lime"])).toEqual([]);
  });

  it("claims each of the Special's ingredients once", () => {
    // Two noodle-ish guesses against one pasta: one yellow, in the guess's own order.
    expect(nearIngredients(["spaghetti", "noodles"], ["pasta", "egg"])).toEqual([
      { ingredient: "spaghetti", family: "noodle & pasta" },
    ]);
    expect(nearIngredients(["spaghetti", "noodles"], ["pasta", "macaroni"])).toHaveLength(2);
  });

  it("keeps staples out of it: they match exactly or not at all", () => {
    expect(nearIngredients(["scallion"], ["onion", "garlic"])).toEqual([]);
    expect(nearIngredients(["sugar"], ["honey"])).toEqual([]);
    expect(nearIngredients(["honey"], ["sugar"])).toEqual([]);
  });

  it("finds nothing for an ingredient nobody has classified yet", () => {
    expect(nearIngredients(["a brand-new ingredient"], ["a brand-new ingredient 2"])).toEqual([]);
  });

  it("does not make the spirits cousins: the Spirit tile already says so", () => {
    expect(nearIngredients(["gin"], ["whiskey"])).toEqual([]);
  });

  it("carries the guess's ingredient and the family, and nothing about the Special's own", () => {
    // The family's NAME is the hint (it may well contain the word), but the entry itself
    // holds only the two fields, so the Special's ingredient is never a value in it.
    const [near] = nearIngredients(["noodles"], ["pasta"]);
    expect(Object.keys(near).sort()).toEqual(["family", "ingredient"]);
    expect(near.ingredient).toBe("noodles");
  });

  it("handles empty lists", () => {
    expect(nearIngredients([], ["pasta"])).toEqual([]);
    expect(nearIngredients(["pasta"], [])).toEqual([]);
  });
});

describe("nearRate", () => {
  it("counts the pairs, the yellows and the pairs a yellow rescued", () => {
    const rate = nearRate([
      { name: "Aglio", ingredients: ["pasta", "garlic", "olive oil"] },
      { name: "Pad Thai", ingredients: ["noodles", "lime", "tofu"] },
      { name: "Gazpacho", ingredients: ["tomato", "cucumber", "vinegar"] },
    ]);
    expect(rate.pairs).toBe(6);
    // Aglio <-> Pad Thai is the only cousin pair, and it runs both ways.
    expect(rate.withNear).toBe(2);
    expect(rate.noOverlap).toBe(6);
    expect(rate.noOverlapRescued).toBe(2);
  });

  it("is empty for fewer than two items", () => {
    expect(nearRate([{ name: "Solo", ingredients: ["pasta"] }])).toEqual({
      pairs: 0,
      withNear: 0,
      noOverlap: 0,
      noOverlapRescued: 0,
    });
  });
});
