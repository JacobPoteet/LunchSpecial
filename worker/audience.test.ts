import { describe, expect, it } from "vitest";
import {
  MAX_COHORT_WEEKS,
  foldAudience,
  foldAudienceSlice,
  weekStartOf,
  type AudienceRoundRow,
  type AudienceVisitRow,
} from "./audience";

/** A round group at 16:00 UTC — noon ET in September, so it stays on `date`. */
const round = (
  player: string,
  date: string,
  extra: Partial<AudienceRoundRow> = {},
): AudienceRoundRow => ({
  player_id: player,
  surface: "web",
  bucket: `${date} 16`,
  started: 1,
  completed: 1,
  shared: 0,
  ...extra,
});

const visit = (player: string, day: string, surface = "web"): AudienceVisitRow => ({
  player_id: player,
  surface,
  visit_day: day,
});

// A Wednesday. The week it sits in opens Monday 2026-09-21.
const TODAY = "2026-09-23";

describe("weekStartOf", () => {
  it("opens the week on Monday", () => {
    expect(weekStartOf("2026-09-21")).toBe("2026-09-21");
    expect(weekStartOf("2026-09-23")).toBe("2026-09-21");
    // Sunday belongs to the week before it.
    expect(weekStartOf("2026-09-27")).toBe("2026-09-21");
  });
});

describe("foldAudienceSlice · KPI windows", () => {
  it("counts the last seven complete days and leaves today out", () => {
    const s = foldAudienceSlice(
      [
        round("old", "2026-09-01"),
        round("old", "2026-09-20"), // returning, inside last week
        round("new", "2026-09-22"), // new, inside last week
        round("today", TODAY), // today: in neither window
        round("prior", "2026-09-10"), // prior week
      ],
      [],
      TODAY,
      "2026-09-01",
      null,
    );
    expect(s.lastWeek).toEqual({ from: "2026-09-16", to: "2026-09-22", active: 2, new: 1, returning: 1 });
    expect(s.priorWeek).toEqual({ from: "2026-09-09", to: "2026-09-15", active: 1, new: 1, returning: 0 });
  });
});

describe("foldAudienceSlice · weeks", () => {
  it("splits each week into first-week devices and the rest, and marks the running week", () => {
    const s = foldAudienceSlice(
      [round("a", "2026-09-08"), round("a", "2026-09-15"), round("b", "2026-09-16"), round("a", TODAY)],
      [],
      TODAY,
      "2026-09-08",
      null,
    );
    expect(s.weeks).toEqual([
      { weekStart: "2026-09-07", new: 1, returning: 0, daysElapsed: 7, firstTracked: true },
      { weekStart: "2026-09-14", new: 1, returning: 1, daysElapsed: 7, firstTracked: false },
      { weekStart: "2026-09-21", new: 0, returning: 1, daysElapsed: 3, firstTracked: false },
    ]);
  });

  it("counts a device once per week however many days it played", () => {
    const s = foldAudienceSlice(
      [round("a", "2026-09-14"), round("a", "2026-09-15"), round("a", "2026-09-16")],
      [],
      TODAY,
      "2026-09-14",
      null,
    );
    expect(s.weeks[0]).toMatchObject({ new: 1, returning: 0 });
  });

  it("draws nothing before tracking exists", () => {
    const s = foldAudienceSlice([], [], TODAY, null, null);
    expect(s.weeks).toEqual([]);
    expect(s.cohorts).toEqual([]);
  });
});

describe("foldAudienceSlice · cohorts", () => {
  it("counts later weeks and leaves the running one unanswered", () => {
    const s = foldAudienceSlice(
      [
        round("a", "2026-09-01"),
        round("b", "2026-09-02"),
        round("a", "2026-09-09"), // +1
        round("b", "2026-09-17"), // +2
        round("a", TODAY), // +3, still running
      ],
      [],
      TODAY,
      "2026-09-01",
      null,
    );
    expect(s.cohorts).toEqual([
      { weekStart: "2026-08-31", size: 2, back: [1, 1, null], firstTracked: true },
    ]);
  });

  it("never follows a cohort past the cap", () => {
    const s = foldAudienceSlice([round("a", "2026-06-01")], [], TODAY, "2026-06-01", null);
    expect(s.cohorts[0].back).toHaveLength(MAX_COHORT_WEEKS);
  });
});

describe("foldAudienceSlice · arrival funnel", () => {
  it("splits first visits from returning ones, with each stage a subset of the one above", () => {
    const s = foldAudienceSlice(
      [round("p", "2026-09-01", { shared: 1 }), round("p", "2026-09-05")],
      [visit("p", "2026-09-01"), visit("p", "2026-09-05"), visit("b", "2026-09-01")],
      TODAY,
      "2026-09-01",
      "2026-09-01",
    );
    expect(s.firstVisit).toMatchObject({ arrived: 2, played: 1, finished: 1, shared: 1 });
    expect(s.returning).toMatchObject({ arrived: 1, played: 1, finished: 1, shared: 0 });
  });

  it("follows first-timers for seven days, split by whether they guessed", () => {
    const s = foldAudienceSlice(
      [round("p", "2026-09-01"), round("p", "2026-09-06")],
      [
        visit("p", "2026-09-01"),
        visit("b", "2026-09-01"), // bounced, never back
        visit("late", "2026-09-01"),
        visit("late", "2026-09-20"), // back, but outside the window
        visit("young", "2026-09-20"), // arrived inside the last seven days
      ],
      TODAY,
      "2026-09-01",
      "2026-09-01",
    );
    expect(s.firstVisit.cameBack.ifPlayed).toEqual({ returned: 1, atRisk: 1, pending: 0 });
    expect(s.firstVisit.cameBack.ifBounced).toEqual({ returned: 0, atRisk: 2, pending: 1 });
  });

  it("calls a device that played before the visit beacon a returning arrival", () => {
    const s = foldAudienceSlice(
      [round("p", "2026-08-01")],
      [visit("p", "2026-09-01")],
      TODAY,
      "2026-08-01",
      "2026-09-01",
    );
    expect(s.firstVisit.arrived).toBe(0);
    expect(s.returning.arrived).toBe(1);
  });
});

describe("foldAudience", () => {
  it("returns every surface, each folded only from its own rows", () => {
    const r = foldAudience(
      [round("w", "2026-09-20"), round("d", "2026-09-20", { surface: "discord" })],
      [visit("w", "2026-09-20"), visit("d", "2026-09-20", "discord")],
      TODAY,
      "2026-09-01",
    );
    expect(r.visitsSince).toBe("2026-09-20");
    expect(r.bySurface.all.lastWeek.active).toBe(2);
    expect(r.bySurface.web.lastWeek.active).toBe(1);
    expect(r.bySurface.discord.lastWeek.active).toBe(1);
    expect(r.bySurface.discord.firstVisit.arrived).toBe(1);
  });
});
