import { describe, expect, it } from "vitest";
import {
  RETENTION_WINDOW_DAYS,
  daysBetween,
  etDayOfHourBucket,
  etDayOfUtcStamp,
  foldPlayerActivity,
  foldRetention,
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

describe("daysBetween", () => {
  it("counts whole calendar days forward", () => {
    expect(daysBetween("2026-07-24", "2026-07-31")).toBe(7);
    expect(daysBetween("2026-07-24", "2026-07-24")).toBe(0);
  });

  it("is negative going backwards and survives a month boundary", () => {
    expect(daysBetween("2026-08-02", "2026-07-31")).toBe(-2);
    expect(daysBetween("2026-07-31", "2026-08-02")).toBe(2);
  });
});

describe("foldRetention", () => {
  // Far enough past every fixture day that nothing is censored unless a test
  // deliberately puts a visit near it.
  const TODAY = "2026-09-01";
  /** Build activity from (player, day) pairs. */
  const activity = (...visits: [string, string][]) => foldPlayerActivity(visits.map(([p, d]) => at(p, d)));
  const step = (r: ReturnType<typeof foldRetention>, visits: number) =>
    r?.steps.find((s) => s.visits === visits);

  it("is null before player tracking recorded anything", () => {
    expect(foldRetention(activity(["p1", "2026-07-24"]), TODAY, null)).toBeNull();
  });

  it("reports the window it measured against", () => {
    const r = foldRetention(activity(["p1", "2026-07-24"]), TODAY, "2026-07-24");
    expect(r?.windowDays).toBe(RETENTION_WINDOW_DAYS);
  });

  it("counts a one-visit player as at risk and not returned", () => {
    const r = foldRetention(activity(["p1", "2026-07-24"]), TODAY, "2026-07-24");
    expect(step(r, 1)).toEqual({ visits: 1, atRisk: 1, returned: 0, lateReturned: 0, pending: 0 });
    // Nobody ever reached a second visit, so there's no second rung to draw.
    expect(r?.steps).toHaveLength(1);
  });

  it("counts a return inside the window as returned", () => {
    const r = foldRetention(activity(["p1", "2026-07-24"], ["p1", "2026-07-28"]), TODAY, "2026-07-24");
    expect(step(r, 1)).toMatchObject({ atRisk: 1, returned: 1, lateReturned: 0 });
  });

  it("counts a return after the window as late, not as a return", () => {
    const r = foldRetention(activity(["p1", "2026-07-24"], ["p1", "2026-08-10"]), TODAY, "2026-07-24");
    expect(step(r, 1)).toMatchObject({ atRisk: 1, returned: 0, lateReturned: 1 });
  });

  it("treats a return on the window's last day as inside it", () => {
    const r = foldRetention(activity(["p1", "2026-07-24"], ["p1", "2026-07-31"]), TODAY, "2026-07-24");
    expect(step(r, 1)).toMatchObject({ returned: 1, lateReturned: 0 });
  });

  it("holds a player whose window is still open out of the denominator", () => {
    // Visited yesterday: they can't have failed to return yet, and counting them
    // as a no-show would make a busy week look like a retention collapse.
    const r = foldRetention(activity(["p1", "2026-08-31"]), "2026-09-01", "2026-07-24");
    expect(step(r, 1)).toEqual({ visits: 1, atRisk: 0, returned: 0, lateReturned: 0, pending: 1 });
  });

  it("matures a player the moment the full window has passed", () => {
    const r = foldRetention(activity(["p1", "2026-08-25"]), "2026-09-01", "2026-07-24");
    expect(step(r, 1)).toMatchObject({ atRisk: 1, pending: 0 });
  });

  it("censors per step, not per player", () => {
    // The 1st visit is long settled; the 2nd only just happened, so this player
    // answers step 1 and is still pending on step 2.
    const r = foldRetention(activity(["p1", "2026-07-24"], ["p1", "2026-08-30"]), "2026-09-01", "2026-07-24");
    expect(step(r, 1)).toMatchObject({ atRisk: 1, returned: 0, lateReturned: 1, pending: 0 });
    expect(step(r, 2)).toMatchObject({ atRisk: 0, pending: 1 });
  });

  it("walks a regular up every rung", () => {
    const r = foldRetention(
      activity(["p1", "2026-07-24"], ["p1", "2026-07-26"], ["p1", "2026-07-29"], ["p1", "2026-08-01"]),
      TODAY,
      "2026-07-24",
    );
    expect(step(r, 1)).toMatchObject({ atRisk: 1, returned: 1 });
    expect(step(r, 2)).toMatchObject({ atRisk: 1, returned: 1 });
    expect(step(r, 3)).toMatchObject({ atRisk: 1, returned: 1 });
    expect(step(r, 4)).toMatchObject({ atRisk: 1, returned: 0 });
    expect(r?.steps).toHaveLength(4);
  });

  it("counts one visit per ET day however many rounds it held", () => {
    const r = foldRetention(
      foldPlayerActivity([at("p1", "2026-07-24", 9), at("p1", "2026-07-24", 15), at("p1", "2026-07-24", 20)]),
      TODAY,
      "2026-07-24",
    );
    expect(step(r, 1)).toMatchObject({ atRisk: 1, returned: 0 });
    expect(step(r, 2)).toBeUndefined();
  });

  it("narrows each rung to the players who reached it", () => {
    const r = foldRetention(
      activity(
        ["p1", "2026-07-24"], // one and done
        ["p2", "2026-07-24"],
        ["p2", "2026-07-25"], // came back once
        ["p3", "2026-07-24"],
        ["p3", "2026-07-25"],
        ["p3", "2026-07-27"], // came back twice
      ),
      TODAY,
      "2026-07-24",
    );
    expect(step(r, 1)).toMatchObject({ atRisk: 3, returned: 2 });
    expect(step(r, 2)).toMatchObject({ atRisk: 2, returned: 1 });
    expect(step(r, 3)).toMatchObject({ atRisk: 1, returned: 0 });
  });

  it("stops at the step ladder's cap rather than running forever", () => {
    const days = Array.from({ length: 12 }, (_, i) => `2026-07-${String(10 + i).padStart(2, "0")}`);
    const r = foldRetention(
      foldPlayerActivity(days.map((d) => at("p1", d))),
      TODAY,
      "2026-07-10",
    );
    expect(r?.steps).toHaveLength(5);
  });

  it("has no steps at all when nobody has been tracked", () => {
    expect(foldRetention(foldPlayerActivity([]), TODAY, "2026-07-24")?.steps).toEqual([]);
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
