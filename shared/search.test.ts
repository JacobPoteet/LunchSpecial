import { describe, expect, it } from "vitest";
import { foldAccents, rankByName } from "./search";

const all = [
  { id: 1, name: "Katsu Curry" },
  { id: 2, name: "Pho" },
  { id: 3, name: "Ramen" },
  { id: 4, name: "Shepherd's Pie" },
  { id: 5, name: "Crème Brûlée" },
];
const names = (q: string, limit = 8) => rankByName(q, all, limit).map((d) => d.name);

describe("foldAccents", () => {
  it("drops diacritics and nothing else", () => {
    expect(foldAccents("Crème Brûlée")).toBe("Creme Brulee");
    expect(foldAccents("Pho")).toBe("Pho");
  });
});

describe("rankByName", () => {
  it("puts names that start with the query ahead of names that contain it", () => {
    // The order bar's bug (#204): filtered on contains, never ranked, so a
    // catalogue sorted by name offered "Shepherd's Pie" above "Pho" for "p".
    expect(names("p")).toEqual(["Pho", "Shepherd's Pie"]);
  });

  it("keeps catalogue order inside each group", () => {
    const soups = [
      { id: 1, name: "Ramen" },
      { id: 2, name: "Tom Yum Soup" },
      { id: 3, name: "Soup Joumou" },
      { id: 4, name: "Bird's Nest Soup" },
    ];
    expect(rankByName("soup", soups, 8).map((d) => d.name)).toEqual([
      "Soup Joumou",
      "Tom Yum Soup",
      "Bird's Nest Soup",
    ]);
  });

  it("ignores case and accents on both sides", () => {
    expect(names("CREME")).toEqual(["Crème Brûlée"]);
    expect(names("brûl")).toEqual(["Crème Brûlée"]);
  });

  it("ignores surrounding space", () => {
    expect(names("  pho  ")).toEqual(["Pho"]);
  });

  it("matches nothing on an empty query", () => {
    expect(names("")).toEqual([]);
    expect(names("   ")).toEqual([]);
  });

  it("returns nothing when no name matches", () => {
    expect(names("zzz")).toEqual([]);
  });

  it("caps the list, and a prefix match still beats a contains match at the cap", () => {
    // Twenty "X Pie"s sit before "Pie Floater" alphabetically; the cap must not
    // fill up with contains matches before the prefix match is reached.
    const pies = [
      ...Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `${String.fromCharCode(65 + i)} Pie` })),
      { id: 99, name: "Pie Floater" },
    ];
    const got = rankByName("pie", pies, 3).map((d) => d.name);
    expect(got).toHaveLength(3);
    expect(got[0]).toBe("Pie Floater");
  });
});
