import { describe, expect, it } from "vitest";
import { normalizeSource, SOURCE_DIRECT, SOURCE_MAX_LENGTH } from "./attribution";

describe("normalizeSource", () => {
  it("keeps ordinary ad-platform values", () => {
    for (const s of ["reddit", "facebook", "newsletter", "product-hunt", "hacker_news", "x.com"]) {
      expect(normalizeSource(s)).toBe(s);
    }
  });

  it("case-folds, so one source can't split into two slices", () => {
    expect(normalizeSource("Reddit")).toBe("reddit");
    expect(normalizeSource("REDDIT")).toBe("reddit");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSource("  reddit  ")).toBe("reddit");
  });

  it("rejects anything that isn't a usable string", () => {
    for (const raw of [null, undefined, 42, {}, [], true]) {
      expect(normalizeSource(raw)).toBeNull();
    }
  });

  it("rejects empty and whitespace-only values", () => {
    expect(normalizeSource("")).toBeNull();
    expect(normalizeSource("   ")).toBeNull();
  });

  it("rejects rather than truncates an over-long value", () => {
    expect(normalizeSource("a".repeat(SOURCE_MAX_LENGTH))).toBe("a".repeat(SOURCE_MAX_LENGTH));
    // Truncating would coin a plausible-looking label for unaccountable traffic.
    expect(normalizeSource("a".repeat(SOURCE_MAX_LENGTH + 1))).toBeNull();
  });

  it("rejects characters outside the charset", () => {
    for (const raw of [
      "red dit",
      "reddit!",
      "<script>",
      "reddit/ads",
      "reddit?x=1",
      "reddit%20ads",
      "réddit",
      "'; DROP TABLE analytics_visits; --",
    ]) {
      expect(normalizeSource(raw)).toBeNull();
    }
  });

  it("requires the value to start on an alphanumeric", () => {
    expect(normalizeSource("-reddit")).toBeNull();
    expect(normalizeSource(".reddit")).toBeNull();
    expect(normalizeSource("_reddit")).toBeNull();
  });

  it("accepts the direct sentinel, which is indistinguishable from an untagged arrival", () => {
    expect(normalizeSource(SOURCE_DIRECT)).toBe(SOURCE_DIRECT);
  });
});
