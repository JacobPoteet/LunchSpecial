import { describe, expect, it } from "vitest";
import {
  OCCASIONS,
  OCCASION_IDS,
  baselineFor,
  defaultSeason,
  occasionOn,
  occasionRuns,
  parseBookingInput,
  seasonOpening,
  shareVerdict,
  foldReach,
  type SightingRow,
  type OccasionBooking,
} from "./occasions";

const booking = (startDate: string, endDate: string, isActive = true): OccasionBooking => ({
  occasionId: "halloween",
  startDate,
  endDate,
  isActive,
});

describe("the default window", () => {
  it("runs Oct 24 to Oct 31, both ends included, every year", () => {
    expect(occasionOn("2026-10-23", [])).toBeNull();
    expect(occasionOn("2026-10-24", [])).toBe("halloween");
    expect(occasionOn("2026-10-31", [])).toBe("halloween");
    expect(occasionOn("2026-11-01", [])).toBeNull();
    expect(occasionOn("2031-10-28", [])).toBe("halloween");
  });

  it("finds the season a day sits in", () => {
    expect(defaultSeason("halloween", "2026-10-30")).toEqual({ start: "2026-10-24", end: "2026-10-31" });
    expect(defaultSeason("halloween", "2026-07-17")).toBeNull();
    expect(seasonOpening("halloween", 2027)).toEqual({ start: "2027-10-24", end: "2027-10-31" });
  });

  it("every registered window is a real MM-DD pair", () => {
    for (const id of OCCASION_IDS) {
      const { from, to } = OCCASIONS[id];
      for (const md of [from, to]) {
        expect(md).toMatch(/^\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(`2028-${md}`))).toBe(false);
      }
    }
  });
});

describe("bookings", () => {
  it("a live booking puts the occasion on outside its window (a test run in March)", () => {
    expect(occasionOn("2027-03-02", [booking("2027-03-01", "2027-03-03")])).toBe("halloween");
    expect(occasionOn("2027-03-04", [booking("2027-03-01", "2027-03-03")])).toBeNull();
  });

  it("a booking that touches the season speaks for all of it (shortened)", () => {
    const shortened = [booking("2026-10-30", "2026-10-31")];
    expect(occasionOn("2026-10-26", shortened)).toBeNull();
    expect(occasionOn("2026-10-30", shortened)).toBe("halloween");
  });

  it("shifted and extended", () => {
    const shifted = [booking("2026-10-17", "2026-11-01")];
    expect(occasionOn("2026-10-17", shifted)).toBe("halloween");
    expect(occasionOn("2026-11-01", shifted)).toBe("halloween");
    expect(occasionOn("2026-11-02", shifted)).toBeNull();
  });

  it("off outranks the dates: an inactive booking switches the year off", () => {
    const off = [booking("2026-10-24", "2026-10-31", false)];
    expect(occasionOn("2026-10-31", off)).toBeNull();
    // ...and leaves next year's default alone.
    expect(occasionOn("2027-10-31", off)).toBe("halloween");
  });

  it("an unrelated booking in another month leaves the season's default running", () => {
    expect(occasionOn("2026-10-28", [booking("2026-03-01", "2026-03-03")])).toBe("halloween");
  });
});

describe("runs", () => {
  it("folds a range into unbroken runs, clipped to the range", () => {
    expect(occasionRuns("2026-10-01", "2026-10-27", [])).toEqual([
      { occasionId: "halloween", start: "2026-10-24", end: "2026-10-27" },
    ]);
    expect(occasionRuns("2026-07-17", "2027-12-31", [])).toEqual([
      { occasionId: "halloween", start: "2026-10-24", end: "2026-10-31" },
      { occasionId: "halloween", start: "2027-10-24", end: "2027-10-31" },
    ]);
  });

  it("a gap in the bookings is two runs", () => {
    const split = [booking("2026-10-24", "2026-10-25"), booking("2026-10-30", "2026-10-31")];
    expect(occasionRuns("2026-10-01", "2026-11-30", split)).toEqual([
      { occasionId: "halloween", start: "2026-10-24", end: "2026-10-25" },
      { occasionId: "halloween", start: "2026-10-30", end: "2026-10-31" },
    ]);
  });

  it("baselines on the same weekdays, ending before the run starts", () => {
    // Eight days (Sat Oct 24 .. Sat Oct 31) -> two weeks back, eight days long.
    expect(baselineFor({ start: "2026-10-24", end: "2026-10-31" })).toEqual({ start: "2026-10-10", end: "2026-10-17" });
    expect(baselineFor({ start: "2026-10-31", end: "2026-10-31" })).toEqual({ start: "2026-10-24", end: "2026-10-24" });
  });
});

describe("parseBookingInput", () => {
  it("accepts a well-formed booking and defaults it to live", () => {
    expect(parseBookingInput({ occasionId: "halloween", startDate: "2026-10-24", endDate: "2026-10-31" })).toEqual({
      input: booking("2026-10-24", "2026-10-31"),
    });
  });

  it.each([
    [{ occasionId: "easter", startDate: "2026-10-24", endDate: "2026-10-31" }, "Unknown occasion"],
    [{ occasionId: "halloween", startDate: "10/24", endDate: "2026-10-31" }, "Start date must be YYYY-MM-DD"],
    [{ occasionId: "halloween", startDate: "2026-10-31", endDate: "2026-10-24" }, "The end date can't be before the start date"],
    [{ occasionId: "halloween", startDate: "2026-10-24", endDate: "2027-10-31" }, "An occasion runs 63 days at most"],
  ])("refuses %j", (raw, error) => {
    expect(parseBookingInput(raw)).toEqual({ error });
  });
});

describe("shareVerdict", () => {
  const t = (started: number, completed: number, shared: number) => ({ started, completed, shared });

  it("waits while the run is still going", () => {
    expect(shareVerdict(t(100, 90, 40), t(100, 90, 10), true)).toMatch(/^Still running/);
  });

  it("refuses to compare against nothing", () => {
    expect(shareVerdict(t(10, 0, 0), t(100, 90, 10), false)).toMatch(/^Not enough/);
  });

  it("calls a difference only when the intervals part", () => {
    expect(shareVerdict(t(300, 280, 140), t(300, 280, 40), false)).toBe(
      "Shares ran higher in costume: 50% of finished rounds against 14% on the same weekdays before.",
    );
    expect(shareVerdict(t(12, 10, 4), t(12, 10, 2), false)).toBe(
      "No clear difference in sharing: 40% of finished rounds in costume against 20% before.",
    );
  });
});

describe("foldReach", () => {
  const run = { start: "2026-10-24", end: "2026-10-31" };
  const row = (player_id: string, seen_day: string, extra: Partial<SightingRow> = {}): SightingRow => ({
    player_id,
    seen_day,
    play_day: seen_day,
    room: "diner",
    moment: "seen",
    surface: "web",
    ...extra,
  });

  it("counts distinct devices, by room and surface, and zero-fills the days so far", () => {
    const reach = foldReach(run, "2026-10-26", [
      row("a", "2026-10-24"),
      row("a", "2026-10-24", { room: "bar" }),
      row("b", "2026-10-26", { surface: "discord" }),
    ], "2026-10-20");
    expect(reach.devices).toBe(2);
    expect(reach.byRoom).toEqual({ diner: 2, bar: 1 });
    expect(reach.bySurface).toEqual({ web: 1, discord: 1 });
    expect(reach.daily).toEqual([
      { date: "2026-10-24", devices: 1 },
      { date: "2026-10-25", devices: 0 },
      { date: "2026-10-26", devices: 1 },
    ]);
    expect(reach.measuredFrom).toBe("2026-10-24");
  });

  it("counts returns, knocks and Leftover replays after the run apart", () => {
    const reach = foldReach(run, "2027-03-02", [
      row("a", "2026-10-24"),
      row("a", "2026-10-30"),
      row("b", "2026-10-25"),
      row("b", "2026-10-25", { moment: "knock" }),
      row("c", "2027-03-01", { play_day: "2026-10-31" }),
    ], "2026-10-20");
    expect(reach.devices).toBe(2);
    expect(reach.returned).toBe(1);
    expect(reach.knocked).toBe(1);
    expect(reach.after).toBe(1);
    expect(reach.daily).toHaveLength(8);
  });

  it("calls a run before the ledger unmeasured, and a run it began during partly measured", () => {
    expect(foldReach(run, "2027-01-01", [], null).measuredFrom).toBeNull();
    expect(foldReach(run, "2027-01-01", [], "2026-11-05").measuredFrom).toBeNull();
    expect(foldReach(run, "2027-01-01", [], "2026-10-28").measuredFrom).toBe("2026-10-28");
  });
});
