import { describe, expect, it } from "vitest";
import { foldDayService, foldPace, type DayHourRow, type PaceRow } from "./service";
import type { RoundKind } from "../shared/types";

/**
 * A (UTC hour, kind) group. `hour` is UTC — in July that's EDT (UTC-4), so 16:00
 * UTC is noon ET on the same day and 02:00 UTC is 22:00 ET on the *previous* one.
 */
const row = (
  date: string,
  hour: number,
  kind: RoundKind,
  started: number,
  extra: Partial<DayHourRow> = {},
): DayHourRow => ({
  bucket: `${date} ${String(hour).padStart(2, "0")}`,
  kind,
  started,
  completed: 0,
  solved: 0,
  shared: 0,
  last_started: null,
  ...extra,
});

/** Total games started in an hour, across all three kinds. */
const startedAt = (s: ReturnType<typeof foldDayService>, hour: number) => {
  const k = s.hourly[hour].startedByKind;
  return k.daily + k.leftover + k.random;
};

describe("foldDayService", () => {
  it("returns a full 24-hour frame even with no rows", () => {
    const s = foldDayService([], "2026-07-24");
    expect(s.hourly).toHaveLength(24);
    expect(s.hourly.map((h) => h.hour)).toEqual([...Array(24).keys()]);
    expect(s.allKinds).toEqual({ started: 0, completed: 0, solved: 0, shared: 0 });
    expect(s.lastStartedAt).toBeNull();
  });

  it("folds a UTC hour into its ET hour of day", () => {
    // 16:00 UTC = 12:00 ET (EDT, UTC-4).
    const s = foldDayService([row("2026-07-24", 16, "daily", 5)], "2026-07-24");
    expect(startedAt(s, 12)).toBe(5);
    expect(startedAt(s, 16)).toBe(0);
  });

  it("keeps the three kinds separate in the same hour", () => {
    const s = foldDayService(
      [
        row("2026-07-24", 16, "daily", 5),
        row("2026-07-24", 16, "leftover", 2),
        row("2026-07-24", 16, "random", 1),
      ],
      "2026-07-24",
    );
    expect(s.hourly[12].startedByKind).toEqual({ daily: 5, leftover: 2, random: 1 });
    expect(s.allKinds.started).toBe(8);
  });

  it("claims the late-UTC hours that belong to this ET day", () => {
    // 02:00 UTC on the 25th is 22:00 ET on the 24th — the reason the query asks
    // for a ±1-day UTC window instead of a single date.
    const s = foldDayService([row("2026-07-25", 2, "daily", 3)], "2026-07-24");
    expect(startedAt(s, 22)).toBe(3);
    expect(s.allKinds.started).toBe(3);
  });

  it("drops rows from the neighbouring ET days the window swept in", () => {
    const s = foldDayService(
      [
        row("2026-07-23", 16, "daily", 9), // the day before, in ET
        row("2026-07-24", 16, "daily", 4),
        row("2026-07-25", 16, "daily", 7), // the day after, in ET
      ],
      "2026-07-24",
    );
    expect(s.allKinds.started).toBe(4);
  });

  it("sums completions, solves and shares across every kind", () => {
    const s = foldDayService(
      [
        row("2026-07-24", 16, "daily", 10, { completed: 8, solved: 6, shared: 3 }),
        row("2026-07-24", 17, "leftover", 4, { completed: 3, solved: 3, shared: 1 }),
      ],
      "2026-07-24",
    );
    expect(s.allKinds).toEqual({ started: 14, completed: 11, solved: 9, shared: 4 });
  });

  it("reports the newest start on the day as an ISO instant", () => {
    const s = foldDayService(
      [
        row("2026-07-24", 16, "daily", 1, { last_started: "2026-07-24 16:05:00" }),
        row("2026-07-24", 18, "daily", 1, { last_started: "2026-07-24 18:42:19" }),
        row("2026-07-24", 17, "leftover", 1, { last_started: "2026-07-24 17:30:00" }),
      ],
      "2026-07-24",
    );
    expect(s.lastStartedAt).toBe("2026-07-24T18:42:19Z");
  });

  it("ignores a newest start that belongs to another ET day", () => {
    const s = foldDayService(
      [
        row("2026-07-24", 16, "daily", 1, { last_started: "2026-07-24 16:05:00" }),
        row("2026-07-25", 16, "daily", 1, { last_started: "2026-07-25 16:00:00" }),
      ],
      "2026-07-24",
    );
    expect(s.lastStartedAt).toBe("2026-07-24T16:05:00Z");
  });

  it("skips unparseable buckets rather than throwing", () => {
    const s = foldDayService([row("nonsense", 16, "daily", 5)], "2026-07-24");
    expect(s.allKinds.started).toBe(0);
  });
});

describe("foldPace", () => {
  /** `started` games in one UTC hour — kind doesn't matter to the pace baseline. */
  const p = (date: string, hour: number, started: number): PaceRow => ({
    bucket: `${date} ${String(hour).padStart(2, "0")}`,
    started,
  });

  it("is null with no earlier days", () => {
    expect(foldPace([], "2026-07-24")).toBeNull();
  });

  it("excludes the day itself from its own baseline", () => {
    // Only the target day has rows, so there is nothing to average against.
    expect(foldPace([p("2026-07-24", 16, 50)], "2026-07-24")).toBeNull();
  });

  it("builds a cumulative curve from one earlier day", () => {
    // 16:00 UTC = 12:00 ET, 20:00 UTC = 16:00 ET.
    const pace = foldPace([p("2026-07-23", 16, 4), p("2026-07-23", 20, 6)], "2026-07-24")!;
    expect(pace.days).toBe(1);
    expect(pace.typical[11]).toBe(0);
    expect(pace.typical[12]).toBe(4);
    expect(pace.typical[15]).toBe(4); // still 4 — nothing landed between
    expect(pace.typical[16]).toBe(10);
    expect(pace.typical[23]).toBe(10);
  });

  it("averages across the earlier days", () => {
    const pace = foldPace(
      [p("2026-07-22", 16, 10), p("2026-07-23", 16, 20)],
      "2026-07-24",
    )!;
    expect(pace.days).toBe(2);
    expect(pace.typical[12]).toBe(15);
    expect(pace.typical[23]).toBe(15);
  });

  it("keeps only the most recent `lookback` active days", () => {
    // Five earlier days at 10/20/30/40/50 games; a lookback of 2 keeps the last two.
    const rows = ["2026-07-19", "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"].map((d, i) =>
      p(d, 16, (i + 1) * 10),
    );
    const pace = foldPace(rows, "2026-07-24", 2)!;
    expect(pace.days).toBe(2);
    expect(pace.typical[23]).toBe(45); // (40 + 50) / 2
  });

  it("never averages in days that recorded nothing", () => {
    // A three-day gap between the two active days must not pull the mean down —
    // those days weren't quiet, they had no rounds at all.
    const pace = foldPace([p("2026-07-19", 16, 10), p("2026-07-23", 16, 20)], "2026-07-24")!;
    expect(pace.days).toBe(2);
    expect(pace.typical[23]).toBe(15);
  });

  it("attributes a late-UTC hour to the ET day it belongs to", () => {
    // 02:00 UTC on the 24th is 22:00 ET on the 23rd — still an earlier day.
    const pace = foldPace([p("2026-07-24", 2, 8)], "2026-07-24")!;
    expect(pace.days).toBe(1);
    expect(pace.typical[21]).toBe(0);
    expect(pace.typical[22]).toBe(8);
  });

  it("skips unparseable buckets rather than throwing", () => {
    expect(foldPace([{ bucket: "nope", started: 5 }], "2026-07-24")).toBeNull();
  });
});
