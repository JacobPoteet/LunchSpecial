import { describe, expect, it } from "vitest";
import { foldSources, type VisitSourceRow } from "./attribution";
import { RETENTION_WINDOW_DAYS } from "./players";

const TODAY = "2026-08-16";

const visit = (player_id: string, visit_day: string, source: string | null): VisitSourceRow => ({
  player_id,
  visit_day,
  source,
});

const bySource = (rows: VisitSourceRow[], source: string) =>
  foldSources(rows, TODAY).entries.find((e) => e.source === source);

describe("foldSources", () => {
  it("credits a device to its earliest visit, once", () => {
    const mix = foldSources(
      [
        visit("p1", "2026-08-01", "reddit"),
        visit("p1", "2026-08-02", "direct"),
        visit("p1", "2026-08-03", "direct"),
      ],
      TODAY,
    );
    expect(mix.entries).toHaveLength(1);
    expect(mix.entries[0]).toMatchObject({ source: "reddit", arrivals: 1 });
    expect(mix.devices).toBe(1);
  });

  it("does not re-attribute a device that arrives again from somewhere else", () => {
    // Opened the game directly in July, clicked an ad in August. The ad did not
    // acquire them, and crediting it would let campaigns take credit for
    // reminding people who were already playing.
    const mix = foldSources(
      [visit("p1", "2026-07-20", "direct"), visit("p1", "2026-08-01", "reddit")],
      TODAY,
    );
    expect(mix.entries.map((e) => e.source)).toEqual(["direct"]);
  });

  it("counts a return inside the window", () => {
    const entry = bySource([visit("p1", "2026-08-01", "reddit"), visit("p1", "2026-08-05", "direct")], "reddit");
    expect(entry).toMatchObject({ arrivals: 1, atRisk: 1, returned: 1, lateReturned: 0, pending: 0 });
  });

  it("reports a return after the window as late, not as a return", () => {
    // 11 days later: they did come back, but not on the schedule the rate asks about.
    const entry = bySource([visit("p1", "2026-08-01", "reddit"), visit("p1", "2026-08-12", "direct")], "reddit");
    expect(entry).toMatchObject({ arrivals: 1, atRisk: 1, returned: 0, lateReturned: 1 });
  });

  it("holds out arrivals whose window is still open", () => {
    // Arrived 2 days ago and hasn't been back. Scoring them as a no-show would
    // make a campaign lower its own return rate with every fresh arrival.
    const entry = bySource([visit("p1", "2026-08-14", "reddit")], "reddit");
    expect(entry).toMatchObject({ arrivals: 1, atRisk: 0, returned: 0, pending: 1 });
  });

  it("closes the window exactly on the boundary day", () => {
    const onBoundary = "2026-08-09"; // exactly RETENTION_WINDOW_DAYS before TODAY
    const inside = "2026-08-10";
    expect(bySource([visit("p1", onBoundary, "reddit")], "reddit")).toMatchObject({ atRisk: 1, pending: 0 });
    expect(bySource([visit("p2", inside, "reddit")], "reddit")).toMatchObject({ atRisk: 0, pending: 1 });
  });

  it("counts a same-window return even while the window is open", () => {
    const entry = bySource([visit("p1", "2026-08-14", "reddit"), visit("p1", "2026-08-15", "direct")], "reddit");
    expect(entry).toMatchObject({ atRisk: 1, returned: 1, pending: 0 });
  });

  it("reports pre-0024 arrivals as untracked rather than as a source", () => {
    const mix = foldSources(
      [visit("p1", "2026-08-01", null), visit("p2", "2026-08-01", "direct")],
      TODAY,
    );
    expect(mix.untracked).toBe(1);
    expect(mix.entries.map((e) => e.source)).toEqual(["direct"]);
    expect(mix.devices).toBe(2);
  });

  it("judges untracked by the earliest visit, not by any later one", () => {
    // Their first visit predates the column, so how they arrived is unknowable
    // even though a later visit is tagged.
    const mix = foldSources([visit("p1", "2026-08-01", null), visit("p1", "2026-08-04", "reddit")], TODAY);
    expect(mix.untracked).toBe(1);
    expect(mix.entries).toHaveLength(0);
  });

  it("orders by arrivals, then source, independent of row order", () => {
    const rows = [
      visit("p1", "2026-08-01", "zebra"),
      visit("p2", "2026-08-01", "direct"),
      visit("p3", "2026-08-01", "direct"),
      visit("p4", "2026-08-01", "apple"),
    ];
    expect(foldSources(rows, TODAY).entries.map((e) => e.source)).toEqual(["direct", "apple", "zebra"]);
    expect(foldSources([...rows].reverse(), TODAY).entries.map((e) => e.source)).toEqual([
      "direct",
      "apple",
      "zebra",
    ]);
  });

  it("tracks the span of days a source brought people over", () => {
    const entry = bySource(
      [
        visit("p1", "2026-08-03", "reddit"),
        visit("p2", "2026-08-01", "reddit"),
        visit("p3", "2026-08-05", "reddit"),
      ],
      "reddit",
    );
    expect(entry).toMatchObject({ arrivals: 3, firstDay: "2026-08-01", lastDay: "2026-08-05" });
  });

  it("consumes the rows exactly once, so a generator works", () => {
    function* rows(): Generator<VisitSourceRow> {
      yield visit("p1", "2026-08-01", "reddit");
      yield visit("p1", "2026-08-04", "direct");
      yield visit("p2", "2026-08-01", "reddit");
    }
    const mix = foldSources(rows(), TODAY);
    expect(mix.devices).toBe(2);
    expect(mix.entries[0]).toMatchObject({ source: "reddit", arrivals: 2, returned: 1 });
  });

  it("ignores rows with no device or no day", () => {
    const mix = foldSources(
      [visit("", "2026-08-01", "reddit"), visit("p1", "", "reddit"), visit("p2", "2026-08-01", "reddit")],
      TODAY,
    );
    expect(mix.devices).toBe(1);
  });

  it("is empty, not broken, with nothing recorded", () => {
    expect(foldSources([], TODAY)).toEqual({
      entries: [],
      devices: 0,
      untracked: 0,
      windowDays: RETENTION_WINDOW_DAYS,
    });
  });
});
