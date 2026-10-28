import { describe, expect, it } from "vitest";
import { pseudoize, pseudoString } from "./pseudo";

describe("pseudoString", () => {
  it("accents, brackets and pads by about 40%", () => {
    expect(pseudoString("Mute sound")).toBe("[Múté sóúñd ~~~~]");
  });

  it("leaves digits, punctuation and spacing alone", () => {
    expect(pseudoString("3 of 6.")).toBe("[3 óf 6. ~~~]");
  });
});

describe("pseudoize", () => {
  it("walks nested strings and wraps functions, keeping their arity", () => {
    const out = pseudoize({ a: { b: "hat" }, left: (n: number) => `${n} left` });
    expect(out.a.b).toBe("[hát ~~]");
    expect(out.left(2)).toBe("[2 léft ~~~]");
    expect(out.left.length).toBe(1);
  });
});
