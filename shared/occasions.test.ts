import { describe, expect, it } from "vitest";
import {
  OCCASIONS,
  OCCASION_IDS,
  baselineFor,
  findOverlap,
  foldReach,
  nextSuggested,
  occasionOn,
  occasionRuns,
  occasionStatus,
  parseBookingInput,
  shareVerdict,
  suggestedDates,
  type OccasionBooking,
  type SightingRow,
} from "./occasions";

const booking = (startDate: string, endDate: string, isActive = true): OccasionBooking => ({
  occasionId: "halloween",
  startDate,
  endDate,
  isActive,
});

describe("occasionOn", () => {
  it("wears nothing with nothing booked: suggested dates never run on their own", () => {
    expect(occasionOn("2026-10-31", [])).toBeNull();
  });

  it("wears a live booking on its days, both ends included", () => {
    const b = [booking("2026-10-24", "2026-10-31")];
    expect(occasionOn("2026-10-23", b)).toBeNull();
    expect(occasionOn("2026-10-24", b)).toBe("halloween");
    expect(occasionOn("2026-10-31", b)).toBe("halloween");
    expect(occasionOn("2026-11-01", b)).toBeNull();
  });

  it("off outranks the dates", () => {
    expect(occasionOn("2026-10-30", [booking("2026-10-24", "2026-10-31", false)])).toBeNull();
  });
});

describe("occasionStatus", () => {
  const b = booking("2026-10-24", "2026-10-31");
  it("reads like a notice's", () => {
    expect(occasionStatus(b, "2026-10-01")).toBe("upcoming");
    expect(occasionStatus(b, "2026-10-24")).toBe("active");
    expect(occasionStatus(b, "2026-11-01")).toBe("past");
    expect(occasionStatus({ ...b, isActive: false }, "2026-10-28")).toBe("retired");
  });
});

describe("findOverlap", () => {
  const rows = [
    { ...booking("2026-10-24", "2026-10-31"), id: 1 },
    { ...booking("2026-12-01", "2026-12-03", false), id: 2 },
  ];

  it("refuses a second live booking over the same days", () => {
    expect(findOverlap(booking("2026-10-30", "2026-11-02"), rows)?.id).toBe(1);
  });

  it("lets a booking be edited over its own days", () => {
    expect(findOverlap(booking("2026-10-20", "2026-10-31"), rows, 1)).toBeNull();
  });

  it("ignores pulled bookings on either side", () => {
    expect(findOverlap(booking("2026-12-02", "2026-12-02"), rows)).toBeNull();
    expect(findOverlap(booking("2026-10-25", "2026-10-26", false), rows)).toBeNull();
  });
});

describe("suggested dates", () => {
  it("land in the year asked, and roll to next year once this one is over", () => {
    expect(suggestedDates("halloween", 2027)).toEqual({ start: "2027-10-24", end: "2027-10-31" });
    expect(nextSuggested("halloween", "2026-10-09")).toEqual({ start: "2026-10-24", end: "2026-10-31" });
    expect(nextSuggested("halloween", "2026-10-31")).toEqual({ start: "2026-10-24", end: "2026-10-31" });
    expect(nextSuggested("halloween", "2026-11-01")).toEqual({ start: "2027-10-24", end: "2027-10-31" });
  });

  it("every registered suggestion is a real MM-DD pair", () => {
    for (const id of OCCASION_IDS) {
      for (const md of [OCCASIONS[id].suggested.from, OCCASIONS[id].suggested.to]) {
        expect(md).toMatch(/^\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(`2028-${md}`))).toBe(false);
      }
    }
  });
});

describe("runs", () => {
  it("folds bookings into unbroken runs, clipped to the range", () => {
    const b = [booking("2026-10-24", "2026-10-31"), booking("2027-10-24", "2027-10-31")];
    expect(occasionRuns("2026-10-01", "2026-10-27", b)).toEqual([
      { occasionId: "halloween", start: "2026-10-24", end: "2026-10-27" },
    ]);
    expect(occasionRuns("2026-07-17", "2027-12-31", b)).toHaveLength(2);
  });

  it("baselines on the same weekdays, ending before the run starts", () => {
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
