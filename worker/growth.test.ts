import { describe, expect, it } from "vitest";
import { foldGrowth, GROWTH_TREND_MIN_DAYS, type GrowthRow } from "./growth";

/**
 * One all-time UTC hour bucket. `hour` is UTC — in July that's EDT (UTC-4), so
 * 16:00 UTC is noon ET on the same day and 02:00 UTC is 22:00 ET on the
 * *previous* one.
 */
const row = (date: string, hour: number, n: number): GrowthRow => ({
  bucket: `${date} ${String(hour).padStart(2, "0")}`,
  n,
});

/** A run of consecutive days, one bucket each, starting at `from`. */
const series = (from: string, counts: number[]): GrowthRow[] =>
  counts.map((n, i) => {
    const date = new Date(new Date(`${from}T00:00:00Z`).getTime() + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return row(date, 16, n);
  });

const lastDate = (from: string, days: number) =>
  new Date(new Date(`${from}T00:00:00Z`).getTime() + (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);

describe("foldGrowth", () => {
  it("returns an empty series with no rows", () => {
    expect(foldGrowth([], "2026-08-06")).toEqual({ days: [], trend: null });
  });

  it("folds UTC hours into ET days and sums them", () => {
    const growth = foldGrowth(
      [row("2026-07-24", 16, 5), row("2026-07-24", 20, 3), row("2026-07-25", 2, 4)],
      "2026-07-25",
    );
    // 02:00 UTC on the 25th is 22:00 ET on the 24th — same ET day as the other two.
    expect(growth.days).toEqual([
      { date: "2026-07-24", started: 12 },
      { date: "2026-07-25", started: 0 },
    ]);
  });

  it("zero-fills quiet days between the first round and today", () => {
    const growth = foldGrowth([row("2026-07-20", 16, 4), row("2026-07-23", 16, 6)], "2026-07-24");
    expect(growth.days).toEqual([
      { date: "2026-07-20", started: 4 },
      { date: "2026-07-21", started: 0 },
      { date: "2026-07-22", started: 0 },
      { date: "2026-07-23", started: 6 },
      { date: "2026-07-24", started: 0 },
    ]);
  });

  it("runs through today even when the last rounds were days ago", () => {
    const growth = foldGrowth([row("2026-07-20", 16, 4)], "2026-07-25");
    expect(growth.days).toHaveLength(6);
    expect(growth.days.at(-1)).toEqual({ date: "2026-07-25", started: 0 });
  });

  it("drops buckets dated after today rather than filling to them", () => {
    const growth = foldGrowth([row("2026-07-24", 16, 4), row("2031-01-01", 16, 9)], "2026-07-25");
    expect(growth.days).toHaveLength(2);
    expect(growth.days.at(-1)!.date).toBe("2026-07-25");
  });

  it("ignores buckets that don't parse", () => {
    const growth = foldGrowth([{ bucket: "not-a-date", n: 99 }, row("2026-07-24", 16, 4)], "2026-07-24");
    expect(growth.days).toEqual([{ date: "2026-07-24", started: 4 }]);
  });

  it("crosses a month boundary", () => {
    const growth = foldGrowth([row("2026-07-31", 16, 2)], "2026-08-02");
    expect(growth.days.map((d) => d.date)).toEqual(["2026-07-31", "2026-08-01", "2026-08-02"]);
  });
});

describe("foldGrowth trend", () => {
  it("withholds the fit until the window is long enough", () => {
    const short = GROWTH_TREND_MIN_DAYS - 1;
    const counts = Array.from({ length: short }, (_, i) => i + 1);
    const growth = foldGrowth(series("2026-07-01", counts), lastDate("2026-07-01", short));
    expect(growth.days).toHaveLength(short);
    expect(growth.trend).toBeNull();
  });

  it("recovers the slope of a perfectly linear run", () => {
    // 2, 5, 8, … — three more games each day, fitted exactly.
    const counts = Array.from({ length: 10 }, (_, i) => 2 + 3 * i);
    const growth = foldGrowth(series("2026-07-01", counts), lastDate("2026-07-01", 10));
    expect(growth.trend).not.toBeNull();
    expect(growth.trend!.slope).toBeCloseTo(3, 10);
    expect(growth.trend!.first).toBeCloseTo(2, 10);
    expect(growth.trend!.last).toBeCloseTo(29, 10);
    expect(growth.trend!.days).toBe(10);
  });

  it("reports a flat run as a real zero slope, not a missing trend", () => {
    const growth = foldGrowth(series("2026-07-01", Array(8).fill(6)), lastDate("2026-07-01", 8));
    expect(growth.trend).not.toBeNull();
    expect(growth.trend!.slope).toBeCloseTo(0, 10);
    expect(growth.trend!.first).toBeCloseTo(6, 10);
  });

  it("goes negative when play is falling off", () => {
    const counts = Array.from({ length: 8 }, (_, i) => 20 - 2 * i);
    const growth = foldGrowth(series("2026-07-01", counts), lastDate("2026-07-01", 8));
    expect(growth.trend!.slope).toBeCloseTo(-2, 10);
  });

  it("fits the zero-filled days, not just the busy ones", () => {
    // Eight days, only the first busy: a fit over the days actually played would
    // be flat, but the series really did fall away to nothing.
    const growth = foldGrowth([row("2026-07-01", 16, 40)], "2026-07-08");
    expect(growth.days).toHaveLength(8);
    expect(growth.trend!.slope).toBeLessThan(0);
  });
});
