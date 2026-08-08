import { describe, expect, it } from "vitest";
import { foldExperimentSeries, type ExperimentHourRow } from "./experiments";
import { foldPlayerActivity, type PlayerBucketRow } from "./players";

// ET is UTC-4 in summer, so 16:00 UTC is noon ET the same day and 02:00 UTC is
// 22:00 ET on the previous one.
const hour = (bucket: string, over: Partial<ExperimentHourRow> = {}): ExperimentHourRow => ({
  bucket,
  started: 1,
  completed: 0,
  solved: 0,
  shared: 0,
  ...over,
});

const noPlayers = foldPlayerActivity([]);
const activityOf = (pairs: [string, string][]) =>
  foldPlayerActivity(pairs.map(([player_id, bucket]): PlayerBucketRow => ({ player_id, bucket })));

describe("foldExperimentSeries", () => {
  it("returns nothing when no round has been recorded", () => {
    expect(foldExperimentSeries([], "2026-08-08", noPlayers, null)).toEqual([]);
  });

  it("sums a day's hours into one row", () => {
    const series = foldExperimentSeries(
      [
        hour("2026-08-01 16", { started: 4, completed: 3, solved: 2, shared: 1 }),
        hour("2026-08-01 18", { started: 2, completed: 2, solved: 2, shared: 0 }),
      ],
      "2026-08-01",
      noPlayers,
      null,
    );
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ date: "2026-08-01", started: 6, completed: 5, solved: 4, shared: 1 });
  });

  it("attributes a late-UTC hour to the ET day it belongs to", () => {
    const series = foldExperimentSeries([hour("2026-08-02 02", { started: 3 })], "2026-08-02", noPlayers, null);
    expect(series[0].date).toBe("2026-08-01");
    expect(series[0].started).toBe(3);
  });

  // A comparison window is measured in days, so a missing day would quietly
  // shorten one side of it.
  it("fills quiet days with zeros through today", () => {
    const series = foldExperimentSeries(
      [hour("2026-08-01 16"), hour("2026-08-04 16")],
      "2026-08-06",
      noPlayers,
      null,
    );
    expect(series.map((d) => d.date)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
    ]);
    expect(series.map((d) => d.started)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("drops buckets after today rather than stretching the fill to them", () => {
    const series = foldExperimentSeries(
      [hour("2026-08-01 16"), hour("2027-03-01 16", { started: 99 })],
      "2026-08-02",
      noPlayers,
      null,
    );
    expect(series).toHaveLength(2);
    expect(series.reduce((n, d) => n + d.started, 0)).toBe(1);
  });

  it("ignores an unparseable bucket", () => {
    const series = foldExperimentSeries([hour("nope"), hour("2026-08-01 16")], "2026-08-01", noPlayers, null);
    expect(series).toHaveLength(1);
  });

  describe("player counts", () => {
    it("are null on every day when tracking never existed", () => {
      const series = foldExperimentSeries([hour("2026-08-01 16")], "2026-08-01", noPlayers, null);
      expect(series[0].players).toBeNull();
      expect(series[0].newPlayers).toBeNull();
    });

    it("count each device once a day and split off the first-timers", () => {
      // p1 plays on both days (new on the 1st, returning on the 2nd); p2 is new
      // on the 2nd. p1 plays twice on the 2nd and still counts once.
      const activity = activityOf([
        ["p1", "2026-08-01 16"],
        ["p1", "2026-08-02 16"],
        ["p1", "2026-08-02 18"],
        ["p2", "2026-08-02 16"],
      ]);
      const series = foldExperimentSeries(
        [hour("2026-08-01 16"), hour("2026-08-02 16")],
        "2026-08-02",
        activity,
        "2026-08-01",
      );
      expect(series[0]).toMatchObject({ players: 1, newPlayers: 1 });
      expect(series[1]).toMatchObject({ players: 2, newPlayers: 1 });
    });

    it("are null before the tracking start and real zeros after it", () => {
      const activity = activityOf([["p1", "2026-08-03 16"]]);
      const series = foldExperimentSeries(
        [hour("2026-08-01 16"), hour("2026-08-03 16")],
        "2026-08-03",
        activity,
        "2026-08-02",
      );
      expect(series[0]).toMatchObject({ date: "2026-08-01", players: null });
      // Tracked, but nobody played — that is a measurement, and it is zero.
      expect(series[1]).toMatchObject({ date: "2026-08-02", players: 0, newPlayers: 0 });
      expect(series[2]).toMatchObject({ date: "2026-08-03", players: 1, newPlayers: 1 });
    });
  });
});
