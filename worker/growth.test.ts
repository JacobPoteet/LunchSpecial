import { describe, expect, it } from "vitest";
import { foldGrowth, GROWTH_RECENT_DAYS, GROWTH_TREND_MIN_DAYS, type GrowthRow } from "./growth";

/**
 * One all-time UTC hour bucket. `hour` is UTC — in July that's EDT (UTC-4), so
 * 16:00 UTC is noon ET on the same day and 02:00 UTC is 22:00 ET on the
 * *previous* one.
 */
const row = (date: string, hour: number, n: number): GrowthRow => ({
  bucket: `${date} ${String(hour).padStart(2, "0")}`,
  n,
});

const dayAfter = (from: string, i: number) =>
  new Date(new Date(`${from}T00:00:00Z`).getTime() + i * 86_400_000).toISOString().slice(0, 10);

/** A run of consecutive days, one bucket each, starting at `from`. */
const series = (from: string, counts: number[]): GrowthRow[] =>
  counts.map((n, i) => row(dayAfter(from, i), 16, n));

const lastDate = (from: string, days: number) => dayAfter(from, days - 1);

/** The plotted series: the running total, which is what the chart draws. */
const cumulative = (g: ReturnType<typeof foldGrowth>) => g.days.map((d) => d.cumulative);

describe("foldGrowth", () => {
  it("returns an empty series with no rows", () => {
    expect(foldGrowth([], "2026-08-06")).toEqual({ days: [], trend: null });
  });

  it("folds UTC hours into ET days and accumulates them", () => {
    const growth = foldGrowth(
      [row("2026-07-24", 16, 5), row("2026-07-24", 20, 3), row("2026-07-25", 2, 4)],
      "2026-07-25",
    );
    // 02:00 UTC on the 25th is 22:00 ET on the 24th — same ET day as the other two.
    expect(growth.days).toEqual([
      { date: "2026-07-24", started: 12, cumulative: 12 },
      { date: "2026-07-25", started: 0, cumulative: 12 },
    ]);
  });

  it("carries the running total flat across quiet days", () => {
    const growth = foldGrowth([row("2026-07-20", 16, 4), row("2026-07-23", 16, 6)], "2026-07-24");
    expect(growth.days.map((d) => d.date)).toEqual([
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
    ]);
    expect(cumulative(growth)).toEqual([4, 4, 4, 10, 10]);
    expect(growth.days.map((d) => d.started)).toEqual([4, 0, 0, 6, 0]);
  });

  it("never goes down", () => {
    const growth = foldGrowth(series("2026-07-01", [9, 0, 3, 0, 0, 14, 1, 0, 5]), lastDate("2026-07-01", 9));
    const totals = cumulative(growth);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(totals.at(-1)).toBe(32);
  });

  it("runs through today even when the last rounds were days ago", () => {
    const growth = foldGrowth([row("2026-07-20", 16, 4)], "2026-07-25");
    expect(growth.days).toHaveLength(6);
    expect(growth.days.at(-1)).toEqual({ date: "2026-07-25", started: 0, cumulative: 4 });
  });

  it("drops buckets dated after today rather than filling to them", () => {
    const growth = foldGrowth([row("2026-07-24", 16, 4), row("2031-01-01", 16, 9)], "2026-07-25");
    expect(growth.days).toHaveLength(2);
    expect(growth.days.at(-1)).toEqual({ date: "2026-07-25", started: 0, cumulative: 4 });
  });

  it("ignores buckets that don't parse", () => {
    const growth = foldGrowth([{ bucket: "not-a-date", n: 99 }, row("2026-07-24", 16, 4)], "2026-07-24");
    expect(growth.days).toEqual([{ date: "2026-07-24", started: 4, cumulative: 4 }]);
  });

  it("crosses a month boundary", () => {
    const growth = foldGrowth([row("2026-07-31", 16, 2)], "2026-08-02");
    expect(growth.days.map((d) => d.date)).toEqual(["2026-07-31", "2026-08-01", "2026-08-02"]);
  });
});

describe("foldGrowth trend", () => {
  it("withholds the fit until the window is long enough", () => {
    const short = GROWTH_TREND_MIN_DAYS - 1;
    const growth = foldGrowth(
      series("2026-07-01", Array(short).fill(3)),
      lastDate("2026-07-01", short),
    );
    expect(growth.days).toHaveLength(short);
    expect(growth.trend).toBeNull();
  });

  it("fits a steady run as its own straight line", () => {
    // 4 games every day: the running total *is* a straight line, so the fit
    // lands on it exactly — slope 4/day, and "lately" matches the average.
    const growth = foldGrowth(series("2026-07-01", Array(10).fill(4)), lastDate("2026-07-01", 10));
    expect(growth.trend).not.toBeNull();
    expect(growth.trend!.slope).toBeCloseTo(4, 10);
    expect(growth.trend!.first).toBeCloseTo(4, 10);
    expect(growth.trend!.last).toBeCloseTo(40, 10);
    expect(growth.trend!.recentPerDay).toBeCloseTo(4, 10);
    expect(growth.trend!.days).toBe(10);
  });

  it("reports a recent pace ahead of the average when the curve steepens", () => {
    // Seven quiet days, then a week of ten a day: gaining.
    const growth = foldGrowth(
      series("2026-07-01", [...Array(7).fill(1), ...Array(7).fill(10)]),
      lastDate("2026-07-01", 14),
    );
    expect(growth.trend!.recentDays).toBe(GROWTH_RECENT_DAYS);
    expect(growth.trend!.recentPerDay).toBeCloseTo(10, 10);
    expect(growth.trend!.recentPerDay).toBeGreaterThan(growth.trend!.slope);
  });

  it("reports a recent pace behind the average when the curve flattens", () => {
    const growth = foldGrowth(
      series("2026-07-01", [...Array(7).fill(10), ...Array(7).fill(1)]),
      lastDate("2026-07-01", 14),
    );
    expect(growth.trend!.recentPerDay).toBeCloseTo(1, 10);
    expect(growth.trend!.recentPerDay).toBeLessThan(growth.trend!.slope);
  });

  it("reports a stalled run as a zero recent pace, not a missing trend", () => {
    // One busy day, then nothing: the curve is flat and the game has stopped.
    const growth = foldGrowth([row("2026-07-01", 16, 40)], "2026-07-10");
    expect(growth.trend).not.toBeNull();
    expect(growth.trend!.recentPerDay).toBe(0);
    expect(growth.trend!.slope).toBeCloseTo(0, 10);
  });

  it("keeps the recent window inside the series at the minimum length", () => {
    const growth = foldGrowth(
      series("2026-07-01", Array(GROWTH_TREND_MIN_DAYS).fill(2)),
      lastDate("2026-07-01", GROWTH_TREND_MIN_DAYS),
    );
    expect(growth.trend!.recentDays).toBe(GROWTH_TREND_MIN_DAYS - 1);
    expect(growth.trend!.recentPerDay).toBeCloseTo(2, 10);
  });

  it("fits a slow start as a line that starts below zero", () => {
    // Accelerating runs cross zero before day one — the drawing code has to clip
    // that, not clamp it, or the reference pace comes out flatter than it is.
    const counts = Array.from({ length: 12 }, (_, i) => i);
    const growth = foldGrowth(series("2026-07-01", counts), lastDate("2026-07-01", 12));
    expect(growth.trend!.first).toBeLessThan(0);
    expect(growth.trend!.recentPerDay).toBeGreaterThan(growth.trend!.slope);
  });
});
