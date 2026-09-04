import { describe, expect, it } from "vitest";
import { foldDeviceData, type DeviceRoundRow, type DeviceVisitRow } from "./device";

const row = (over: Partial<DeviceRoundRow> = {}): DeviceRoundRow => ({
  kind: "daily",
  surface: "web",
  rounds: 1,
  completed: 0,
  shared: 0,
  first_at: "2026-08-01 12:00:00",
  last_at: "2026-08-01 12:05:00",
  ...over,
});

const noVisits: DeviceVisitRow = { total: 0, first_day: null, last_day: null };

describe("foldDeviceData", () => {
  it("reports nothing for a device with no rows", () => {
    expect(foldDeviceData("p1", [], noVisits, 0)).toEqual({
      playerId: "p1",
      rounds: {
        total: 0,
        completed: 0,
        shared: 0,
        byKind: { daily: 0, leftover: 0, random: 0, nightcap: 0 },
        bySurface: { web: 0, discord: 0 },
        firstAt: null,
        lastAt: null,
      },
      visits: { total: 0, firstDay: null, lastDay: null },
      noticeViews: 0,
    });
  });

  it("sums rounds, completions and shares across groups", () => {
    const s = foldDeviceData(
      "p1",
      [
        row({ kind: "daily", rounds: 4, completed: 3, shared: 1 }),
        row({ kind: "leftover", rounds: 2, completed: 2, shared: 0 }),
      ],
      noVisits,
      0,
    );
    expect(s.rounds).toMatchObject({ total: 6, completed: 5, shared: 1 });
  });

  it("zero-fills every kind and surface, so 'none' can't read as 'unknown'", () => {
    const s = foldDeviceData("p1", [row({ kind: "random", surface: "discord", rounds: 3 })], noVisits, 0);
    expect(s.rounds.byKind).toEqual({ daily: 0, leftover: 0, random: 3, nightcap: 0 });
    expect(s.rounds.bySurface).toEqual({ web: 0, discord: 3 });
  });

  it("counts a value outside the enums in the total but in no bucket", () => {
    // Neither column is CHECK-constrained, and `total` is what the delete will
    // actually remove — so an odd row must not go missing from it.
    const s = foldDeviceData("p1", [row({ kind: "brunch", surface: "kiosk", rounds: 2 })], noVisits, 0);
    expect(s.rounds.total).toBe(2);
    expect(s.rounds.byKind).toEqual({ daily: 0, leftover: 0, random: 0, nightcap: 0 });
    expect(s.rounds.bySurface).toEqual({ web: 0, discord: 0 });
  });

  it("spans first and last across groups, not within one", () => {
    const s = foldDeviceData(
      "p1",
      [
        row({ kind: "daily", first_at: "2026-07-20 09:00:00", last_at: "2026-07-20 09:10:00" }),
        row({ kind: "random", first_at: "2026-07-18 22:00:00", last_at: "2026-08-02 08:30:00" }),
      ],
      noVisits,
      0,
    );
    expect(s.rounds.firstAt).toBe("2026-07-18T22:00:00Z");
    expect(s.rounds.lastAt).toBe("2026-08-02T08:30:00Z");
  });

  it("ignores empty stamps rather than letting them win the min", () => {
    const s = foldDeviceData(
      "p1",
      [row({ first_at: null, last_at: null, rounds: 0 }), row({ first_at: "2026-07-20 09:00:00" })],
      noVisits,
      0,
    );
    expect(s.rounds.firstAt).toBe("2026-07-20T09:00:00Z");
  });

  it("carries the arrivals ledger and notice views through as ET days and counts", () => {
    const s = foldDeviceData("p1", [], { total: 9, first_day: "2026-07-17", last_day: "2026-08-10" }, 3);
    expect(s.visits).toEqual({ total: 9, firstDay: "2026-07-17", lastDay: "2026-08-10" });
    expect(s.noticeViews).toBe(3);
  });

  it("echoes the player id it was asked about", () => {
    expect(foldDeviceData("abc-123", [], noVisits, 0).playerId).toBe("abc-123");
  });
});
