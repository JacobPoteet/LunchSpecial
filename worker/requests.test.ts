import { describe, expect, it } from "vitest";
import { findServed, requestKey } from "./requests";

describe("requestKey", () => {
  it("ignores case, accents, punctuation and spacing", () => {
    expect(requestKey("Leche Flan")).toBe(requestKey("  leche   flan "));
    expect(requestKey("Leche-flan")).toBe("leche flan");
    expect(requestKey("Crème Brûlée")).toBe("creme brulee");
  });
});

describe("findServed", () => {
  const served = [
    { name: "Leche Flan", date: "2026-09-29" },
    { name: "Pho", date: "2026-08-01" },
    { name: "Pho", date: "2026-10-02" },
    { name: "Ramen", date: "2026-10-10" },
    { name: "Bibimbap", date: "2026-10-20" },
  ];
  const today = "2026-10-10";

  it("names the day a requested dish already went out", () => {
    expect(findServed("leche flan", served, today)).toEqual({ name: "Leche Flan", date: "2026-09-29" });
  });

  it("picks the most recent serving", () => {
    expect(findServed("PHO", served, today)?.date).toBe("2026-10-02");
  });

  it("never gives away today's board or a later booking", () => {
    expect(findServed("Ramen", served, today)).toBeNull();
    expect(findServed("Bibimbap", served, today)).toBeNull();
  });

  it("matches whole names only", () => {
    expect(findServed("flan", served, today)).toBeNull();
    expect(findServed("   ", served, today)).toBeNull();
  });
});
