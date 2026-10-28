import { describe, expect, it } from "vitest";
import { list, plural } from "./format";

describe("plural", () => {
  const guesses = (locale: string, n: number) => plural(locale, n, { one: `${n} guess`, other: `${n} guesses` });

  it("picks English's one and other", () => {
    expect(guesses("en", 1)).toBe("1 guess");
    expect(guesses("en", 0)).toBe("0 guesses");
    expect(guesses("en", 3)).toBe("3 guesses");
  });

  it("uses a form only the language has", () => {
    const forms = { one: "one", few: "few", many: "many", other: "other" };
    expect(plural("pl", 3, forms)).toBe("few");
    expect(plural("pl", 5, forms)).toBe("many");
  });

  it("falls back to other when a form isn't given", () => {
    expect(plural("ja", 1, { one: "one", other: "other" })).toBe("other");
    expect(plural("pl", 3, { other: "other" })).toBe("other");
  });
});

describe("list", () => {
  it("joins in the locale's own words", () => {
    expect(list("en", ["Japan", "pork", "hot"])).toBe("Japan, pork, and hot");
    expect(list("es", ["Japón", "cerdo", "caliente"])).toBe("Japón, cerdo y caliente");
    expect(list("en", ["tea", "coffee"], "disjunction")).toBe("tea or coffee");
  });
});
