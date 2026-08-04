import { describe, expect, it } from "vitest";
import {
  etDayOfHourBucket,
  etDayOfUtcStamp,
  foldPlayerActivity,
  playersAllTime,
  playersOn,
  type PlayerBucketRow,
} from "./players";

/** A (player, UTC hour bucket) row. `hour` is UTC; 12 stays inside the same ET day. */
const at = (player_id: string, date: string, hour = 12): PlayerBucketRow => ({
  player_id,
  bucket: `${date} ${String(hour).padStart(2, "0")}`,
});

describe("etDayOfHourBucket", () => {
  it("folds a UTC hour into its ET day", () => {
    expect(etDayOfHourBucket("2026-07-24 12")).toBe("2026-07-24");
  });

  it("puts a late-UTC hour on the previous ET day", () => {
    // 02:00 UTC on the 25th is 22:00 ET on the 24th (EDT, UTC-4).
    expect(etDayOfHourBucket("2026-07-25 02")).toBe("2026-07-24");
  });

  it("returns null for an unparseable bucket", () => {
    expect(etDayOfHourBucket("not-a-date")).toBeNull();
  });
});

describe("etDayOfUtcStamp", () => {
  it("folds a full UTC instant into its ET day", () => {
    expect(etDayOfUtcStamp("2026-07-24 15:31:09")).toBe("2026-07-24");
  });

  it("returns null for an unparseable stamp", () => {
    expect(etDayOfUtcStamp("")).toBeNull();
  });
});

describe("foldPlayerActivity", () => {
  it("has no days and no players for no rows", () => {
    const a = foldPlayerActivity([]);
    expect(a.byDay.size).toBe(0);
    expect(a.allTime).toEqual({ new: 0, returning: 0 });
    expect(a.firstDay).toBeNull();
  });

  it("counts a player as new on their earliest ET day only", () => {
    const a = foldPlayerActivity([at("p1", "2026-07-24", 9), at("p1", "2026-07-24", 17)]);
    expect(a.byDay.get("2026-07-24")).toEqual({ new: 1, returning: 0 });
    expect(a.allTime).toEqual({ new: 1, returning: 0 });
    expect(a.firstDay).toBe("2026-07-24");
  });

  it("counts later active days as returning, once per day", () => {
    const a = foldPlayerActivity([
      at("p1", "2026-07-24"),
      at("p1", "2026-07-25", 9),
      at("p1", "2026-07-25", 20),
      at("p1", "2026-07-27"),
    ]);
    expect(a.byDay.get("2026-07-24")).toEqual({ new: 1, returning: 0 });
    expect(a.byDay.get("2026-07-25")).toEqual({ new: 0, returning: 1 });
    expect(a.byDay.get("2026-07-27")).toEqual({ new: 0, returning: 1 });
    // All-time `returning` counts *players* who came back, not their visits.
    expect(a.allTime).toEqual({ new: 1, returning: 1 });
  });

  it("keeps players independent and finds the earliest day across all of them", () => {
    const a = foldPlayerActivity([
      at("p1", "2026-07-26"),
      at("p2", "2026-07-24"),
      at("p2", "2026-07-26"),
      at("p3", "2026-07-26"),
    ]);
    expect(a.byDay.get("2026-07-24")).toEqual({ new: 1, returning: 0 });
    expect(a.byDay.get("2026-07-26")).toEqual({ new: 2, returning: 1 });
    expect(a.allTime).toEqual({ new: 3, returning: 1 });
    expect(a.firstDay).toBe("2026-07-24");
  });

  it("skips rows whose bucket doesn't parse", () => {
    const a = foldPlayerActivity([{ player_id: "p1", bucket: "garbage" }, at("p1", "2026-07-24")]);
    expect(a.allTime).toEqual({ new: 1, returning: 0 });
    expect(a.firstDay).toBe("2026-07-24");
  });
});

describe("playersOn", () => {
  const activity = foldPlayerActivity([at("p1", "2026-07-24"), at("p1", "2026-07-26")]);

  it("returns null for a day before tracking started — unmeasured, not zero", () => {
    expect(playersOn(activity, "2026-07-20", "2026-07-24")).toBeNull();
    expect(playersOn(activity, "2026-07-23", "2026-07-24")).toBeNull();
  });

  it("returns a real zero for a tracked day nobody played", () => {
    expect(playersOn(activity, "2026-07-25", "2026-07-24")).toEqual({ new: 0, returning: 0 });
  });

  it("returns the day's split from the tracking start onward", () => {
    expect(playersOn(activity, "2026-07-24", "2026-07-24")).toEqual({ new: 1, returning: 0 });
    expect(playersOn(activity, "2026-07-26", "2026-07-24")).toEqual({ new: 0, returning: 1 });
  });

  it("returns null for every day when nothing has ever been tracked", () => {
    expect(playersOn(foldPlayerActivity([]), "2026-07-24", null)).toBeNull();
  });

  it("uses the passed-in start, not the filtered rows' own first day", () => {
    // The Discord filter can push a surface's first player weeks past the day the
    // instrument shipped. Those in-between days were measured — Discord simply had
    // nobody — so they must read 0, not "not tracked".
    const discordOnly = foldPlayerActivity([at("p9", "2026-08-01")]);
    expect(discordOnly.firstDay).toBe("2026-08-01");
    expect(playersOn(discordOnly, "2026-07-26", "2026-07-24")).toEqual({ new: 0, returning: 0 });
  });
});

describe("playersAllTime", () => {
  it("is null until something has been tracked", () => {
    expect(playersAllTime(foldPlayerActivity([]), null)).toBeNull();
  });

  it("is the fold's all-time split once tracking has started", () => {
    const a = foldPlayerActivity([at("p1", "2026-07-24"), at("p2", "2026-07-25")]);
    expect(playersAllTime(a, "2026-07-24")).toEqual({ new: 2, returning: 0 });
  });
});
