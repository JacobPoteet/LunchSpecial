import { describe, expect, it } from "vitest";
import type { PublicStats } from "../shared/types";
import { assembleBreakdown, buildBadge, formatCount, isBadgeMetric, solveRate } from "./stats";

const stats: PublicStats = { rounds: 12_450, completed: 9000, solved: 6300, shared: 1200, dishes: 283, avgGuesses: 2.8 };

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
    expect(solveRate({ rounds: 5, completed: 0, solved: 0, shared: 0, dishes: 283, avgGuesses: 0 })).toBe(0);
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

describe("assembleBreakdown", () => {
  it("zeroes everything for an empty table", () => {
    const b = assembleBreakdown(undefined, [], []);
    expect(b.headline).toEqual({ dishes: 0, rounds: 0, completed: 0, solved: 0, shared: 0, avgGuesses: 0 });
    expect(b.devices).toBe(0);
    expect(b.guessDistribution).toEqual([0, 0, 0, 0, 0, 0]);
    expect(b.fails).toBe(0);
    expect(b.modes).toEqual({
      daily: { started: 0, completed: 0 },
      leftover: { started: 0, completed: 0 },
      random: { started: 0, completed: 0 },
    });
    expect(b.surfaces).toEqual({
      web: { rounds: 0, devices: 0 },
      discord: { rounds: 0, devices: 0 },
    });
  });

  it("treats an empty scalar row the same as a missing one", () => {
    const b = assembleBreakdown({}, [], []);
    expect(b.headline.rounds).toBe(0);
    expect(b.guessDistribution).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("buckets a sparse guess distribution into guesses-1 slots", () => {
    const b = assembleBreakdown({}, [{ guesses: 2, n: 5 }, { guesses: 5, n: 1 }], []);
    expect(b.guessDistribution).toEqual([0, 5, 0, 0, 1, 0]);
  });

  it("maps present surfaces and defaults absent ones to zero devices", () => {
    const b = assembleBreakdown({ web_rounds: 40, discord_rounds: 3 }, [], [{ surface: "web", devices: 12 }]);
    expect(b.surfaces.web).toEqual({ rounds: 40, devices: 12 });
    expect(b.surfaces.discord).toEqual({ rounds: 3, devices: 0 });
  });

  it("pulls each mode's started/completed from its own scalar fields", () => {
    const b = assembleBreakdown(
      {
        daily_started: 100,
        daily_completed: 80,
        leftover_started: 30,
        leftover_completed: 25,
        random_started: 10,
        random_completed: 4,
      },
      [],
      [],
    );
    expect(b.modes).toEqual({
      daily: { started: 100, completed: 80 },
      leftover: { started: 30, completed: 25 },
      random: { started: 10, completed: 4 },
    });
  });
});
