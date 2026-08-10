import { describe, expect, it } from "vitest";
import { foldFunnel, type FunnelBucketRow } from "./funnel";
import { DNF_GRACE_MINUTES } from "../shared/types";

/**
 * One (player, UTC hour) group. `hour` is UTC — in July that's EDT (UTC-4), so
 * 16:00 UTC is noon ET on the same day and 02:00 UTC is 22:00 ET on the
 * *previous* one.
 */
const row = (
  player: string,
  date: string,
  hour: number,
  extra: Partial<FunnelBucketRow> = {},
): FunnelBucketRow => ({
  player_id: player,
  bucket: `${date} ${String(hour).padStart(2, "0")}`,
  started: 1,
  completed: 0,
  shared: 0,
  first_completed: null,
  last_started: `${date} ${String(hour).padStart(2, "0")}:00:00`,
  ...extra,
});

const DAY = "2026-07-24";
/** Well past the grace window for anything on DAY, so "still playing" never fires. */
const LATER = new Date("2026-07-26T12:00:00Z");

const visits = (entries: [string, number][]) => new Map(entries);

describe("foldFunnel", () => {
  it("reports zeros and an unmeasured top when there is nothing at all", () => {
    const f = foldFunnel([], new Map(), DAY, LATER);
    expect(f.day).toEqual({
      visited: null,
      played: 0,
      finished: 0,
      shared: 0,
      playedAgain: 0,
      open: { inProgress: 0, abandoned: 0 },
    });
    expect(f.allTime.days).toBe(0);
    expect(f.allTime.since).toBeNull();
    expect(f.allTime.visited).toBeNull();
  });

  it("counts devices, not rounds — four rounds by one player is one player", () => {
    const f = foldFunnel(
      [
        row("a", DAY, 16, { started: 3, completed: 3 }),
        row("a", DAY, 17, { started: 1, completed: 1 }),
      ],
      visits([[DAY, 1]]),
      DAY,
      LATER,
    );
    expect(f.day.visited).toBe(1);
    expect(f.day.played).toBe(1);
    expect(f.day.finished).toBe(1);
  });

  it("folds a UTC hour into the ET day it belongs to", () => {
    // 02:00 UTC on the 25th is 22:00 ET on the 24th.
    const f = foldFunnel([row("a", "2026-07-25", 2)], new Map(), DAY, LATER);
    expect(f.day.played).toBe(1);
    // ...and 16:00 UTC on the 25th is noon ET on the 25th, a different day.
    expect(foldFunnel([row("a", "2026-07-25", 16)], new Map(), DAY, LATER).day.played).toBe(0);
  });

  it("counts a stage once per device however many rounds hit it", () => {
    const f = foldFunnel(
      [
        row("a", DAY, 16, { started: 2, completed: 2, shared: 2 }),
        row("b", DAY, 16, { started: 1, completed: 1, shared: 0 }),
        row("c", DAY, 16, { started: 1 }),
      ],
      visits([[DAY, 5]]),
      DAY,
      LATER,
    );
    expect(f.day).toMatchObject({ visited: 5, played: 3, finished: 2, shared: 1 });
  });

  describe("playedAgain", () => {
    it("counts a round started after an earlier one was finished", () => {
      const f = foldFunnel(
        [
          row("a", DAY, 16, {
            started: 2,
            completed: 1,
            first_completed: `${DAY} 16:05:00`,
            last_started: `${DAY} 16:06:00`,
          }),
        ],
        new Map(),
        DAY,
        LATER,
      );
      expect(f.day.playedAgain).toBe(1);
    });

    it("does not count two rounds opened before either was finished", () => {
      // Both boards were started, then one finished — nobody came back for
      // seconds, they just had two tabs open.
      const f = foldFunnel(
        [
          row("a", DAY, 16, {
            started: 2,
            completed: 1,
            first_completed: `${DAY} 16:09:00`,
            last_started: `${DAY} 16:02:00`,
          }),
        ],
        new Map(),
        DAY,
        LATER,
      );
      expect(f.day.playedAgain).toBe(0);
      expect(f.day.finished).toBe(1);
    });

    it("spans hour buckets — finish late in one hour, replay in the next", () => {
      const f = foldFunnel(
        [
          row("a", DAY, 16, { started: 1, completed: 1, first_completed: `${DAY} 16:58:00` }),
          row("a", DAY, 17, { started: 1, last_started: `${DAY} 17:01:00` }),
        ],
        new Map(),
        DAY,
        LATER,
      );
      expect(f.day.playedAgain).toBe(1);
    });

    it("never exceeds the stage above it — a replay requires a finish", () => {
      const f = foldFunnel([row("a", DAY, 16, { started: 4 })], new Map(), DAY, LATER);
      expect(f.day.finished).toBe(0);
      expect(f.day.playedAgain).toBe(0);
    });
  });

  describe("the unfinished remainder", () => {
    it("calls a recent start still playing and an old one a walkout", () => {
      const now = new Date("2026-07-24T18:00:00Z");
      const fresh = `${DAY} 17:${String(60 - DNF_GRACE_MINUTES / 4).padStart(2, "0")}:00`;
      const f = foldFunnel(
        [
          row("fresh", DAY, 17, { last_started: fresh }),
          row("stale", DAY, 12, { last_started: `${DAY} 12:00:00` }),
        ],
        new Map(),
        DAY,
        now,
      );
      expect(f.day.open).toEqual({ inProgress: 1, abandoned: 1 });
      expect(f.day.played).toBe(2);
      expect(f.day.finished).toBe(0);
    });

    it("leaves finishers out of the split entirely", () => {
      const f = foldFunnel(
        [row("a", DAY, 16, { completed: 1, first_completed: `${DAY} 16:05:00` })],
        new Map(),
        DAY,
        LATER,
      );
      expect(f.day.open).toEqual({ inProgress: 0, abandoned: 0 });
    });
  });

  describe("the measured top", () => {
    it("is null for a day before the visit beacon shipped", () => {
      const f = foldFunnel([row("a", DAY, 16)], visits([["2026-07-30", 4]]), DAY, LATER);
      expect(f.day.visited).toBeNull();
      expect(f.day.played).toBe(1);
    });

    it("is zero — not null — for a measured day nobody opened", () => {
      const f = foldFunnel([], visits([[DAY, 3], ["2026-07-25", 0]]), "2026-07-25", LATER);
      expect(f.day.visited).toBe(0);
    });

    it("keeps a day with arrivals and no plays, which is the loudest signal here", () => {
      const f = foldFunnel([], visits([[DAY, 9]]), DAY, LATER);
      expect(f.day.visited).toBe(9);
      expect(f.day.played).toBe(0);
      expect(f.allTime.days).toBe(1);
      expect(f.allTime.visited).toBe(9);
    });
  });

  describe("the pooled window", () => {
    it("sums device-days rather than de-duplicating devices", () => {
      const f = foldFunnel(
        [row("a", DAY, 16), row("a", "2026-07-25", 16)],
        visits([[DAY, 1], ["2026-07-25", 1]]),
        DAY,
        LATER,
      );
      expect(f.allTime.days).toBe(2);
      expect(f.allTime.visited).toBe(2);
      expect(f.allTime.played).toBe(2);
    });

    it("starts where arrivals started being counted, keeping neither half alone", () => {
      // The 20th recorded plays with nobody counting arrivals. Pooling it would
      // add its players to the funnel while adding no visitors above them.
      const f = foldFunnel(
        [row("old", "2026-07-20", 16), row("new", DAY, 16)],
        visits([[DAY, 6]]),
        DAY,
        LATER,
      );
      expect(f.allTime.since).toBe(DAY);
      expect(f.allTime.days).toBe(1);
      expect(f.allTime.visited).toBe(6);
      expect(f.allTime.played).toBe(1);
    });

    it("pools every activity day when arrivals were never measured", () => {
      const f = foldFunnel(
        [row("a", "2026-07-20", 16), row("b", DAY, 16)],
        new Map(),
        DAY,
        LATER,
      );
      expect(f.allTime.days).toBe(2);
      expect(f.allTime.played).toBe(2);
      expect(f.allTime.visited).toBeNull();
    });
  });
});
