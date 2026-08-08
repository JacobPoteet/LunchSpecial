import { describe, expect, it } from "vitest";
import { foldRhythm, type RhythmRow } from "./rhythm";

// 2026-07-17 is a Friday. ET is UTC-4 in July, so a UTC bucket at hour H lands on
// ET hour H-4 — and anything before 04:00 UTC belongs to the *previous* ET day.
const row = (bucket: string, n = 1): RhythmRow => ({ bucket, n });

describe("foldRhythm", () => {
  it("returns an empty grid with no rows", () => {
    const r = foldRhythm([], "2026-08-01");
    expect(r.started).toBe(0);
    expect(r.days).toBe(0);
    expect(r.since).toBeNull();
    expect(r.heat).toHaveLength(7);
    expect(r.heat[0]).toHaveLength(24);
    expect(r.byWeekday.every((d) => d.perDay === 0)).toBe(true);
  });

  it("places a round on its ET weekday and hour, not its UTC ones", () => {
    // 02:30 UTC Saturday = 22:30 ET Friday.
    const r = foldRhythm([row("2026-07-18 02")], "2026-07-18");
    expect(r.heat[5][22]).toBe(1); // Friday, 22:00 ET
    expect(r.heat[6].every((n) => n === 0)).toBe(true);
    expect(r.byHour[22]).toBe(1);
    expect(r.since).toBe("2026-07-17");
  });

  it("keeps the two marginals consistent with the grid", () => {
    const r = foldRhythm(
      [row("2026-07-17 16", 3), row("2026-07-18 16", 2), row("2026-07-20 20", 5)],
      "2026-07-20",
    );
    const gridTotal = r.heat.flat().reduce((a, b) => a + b, 0);
    expect(gridTotal).toBe(10);
    expect(r.byHour.reduce((a, b) => a + b, 0)).toBe(10);
    expect(r.byWeekday.reduce((a, d) => a + d.started, 0)).toBe(10);
    expect(r.started).toBe(10);
  });

  // The whole point of the module: a launch date must not manufacture a big day.
  it("averages weekdays per occurrence, not as totals", () => {
    // Fri 7/17 through Fri 7/24: Friday comes around twice, every other day once.
    const rows = [row("2026-07-17 16", 10), row("2026-07-24 16", 8), row("2026-07-18 16", 10)];
    const r = foldRhythm(rows, "2026-07-24");
    const friday = r.byWeekday[5];
    const saturday = r.byWeekday[6];
    expect(friday.started).toBe(18);
    expect(friday.days).toBe(2);
    expect(friday.perDay).toBe(9);
    expect(saturday.started).toBe(10);
    expect(saturday.days).toBe(1);
    // Friday has almost twice the rounds and is the *quieter* day — exactly the
    // read a totals chart gets backwards when the run started on a Friday.
    expect(saturday.perDay).toBeGreaterThan(friday.perDay);
  });

  it("counts a weekday that came around but recorded nothing", () => {
    const r = foldRhythm([row("2026-07-17 16", 4)], "2026-07-20");
    const sunday = r.byWeekday[0]; // 7/19 elapsed with no rounds
    expect(sunday.days).toBe(1);
    expect(sunday.started).toBe(0);
    expect(sunday.perDay).toBe(0);
    expect(r.days).toBe(4); // 7/17, 18, 19, 20 inclusive
  });

  it("drops buckets after today rather than stretching the span to them", () => {
    const r = foldRhythm([row("2026-07-17 16", 2), row("2027-01-01 16", 99)], "2026-07-18");
    expect(r.started).toBe(2);
    expect(r.days).toBe(2);
  });

  it("ignores an unparseable bucket", () => {
    const r = foldRhythm([row("not-a-date", 5), row("2026-07-17 16", 1)], "2026-07-17");
    expect(r.started).toBe(1);
  });
});
