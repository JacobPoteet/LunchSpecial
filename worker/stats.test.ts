import { describe, expect, it } from "vitest";
import type { PublicStats } from "../shared/types";
import { buildBadge, formatCount, isBadgeMetric, solveRate } from "./stats";

const stats: PublicStats = { rounds: 12_450, completed: 9000, solved: 6300, shared: 1200 };

describe("formatCount", () => {
  it("leaves counts under 1000 as-is", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(942)).toBe("942");
  });
  it("compacts thousands with one decimal, dropping .0", () => {
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(12_450)).toBe("12.4k");
    expect(formatCount(2000)).toBe("2k");
  });
  it("compacts millions", () => {
    expect(formatCount(2_500_000)).toBe("2.5M");
    expect(formatCount(3_000_000)).toBe("3M");
  });
});

describe("solveRate", () => {
  it("is a whole-number percent of completed", () => {
    expect(solveRate(stats)).toBe(70);
  });
  it("is 0 when nothing has completed", () => {
    expect(solveRate({ rounds: 5, completed: 0, solved: 0, shared: 0 })).toBe(0);
  });
});

describe("isBadgeMetric", () => {
  it("accepts known metrics and rejects others", () => {
    expect(isBadgeMetric("rounds")).toBe(true);
    expect(isBadgeMetric("solveRate")).toBe(true);
    expect(isBadgeMetric("nonsense")).toBe(false);
  });
});

describe("buildBadge", () => {
  it("returns the shields.io endpoint shape", () => {
    const badge = buildBadge("rounds", stats);
    expect(badge.schemaVersion).toBe(1);
    expect(badge.label).toBe("rounds played");
    expect(badge.message).toBe("12.4k");
    expect(badge.cacheSeconds).toBeGreaterThan(0);
    expect(badge.color).toMatch(/^[0-9a-f]{6}$/);
  });
  it("formats the solve-rate badge as a percent", () => {
    expect(buildBadge("solveRate", stats).message).toBe("70%");
  });
});
