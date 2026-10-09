import { describe, expect, it } from "vitest";
import { foldRegulars, type RegularsRoundRow } from "./regulars";

const TODAY = "2026-08-20";

/** One finished Special for a device on an ET day (noon UTC is the same ET day). */
function special(player: string, day: string, over: Partial<RegularsRoundRow> = {}): RegularsRoundRow {
  return {
    player_id: player,
    surface: "web",
    bucket: `${day} 16`,
    kind: "daily",
    completed: 1,
    solved: 1,
    shared: 0,
    guesses: 3,
    n: 1,
    ...over,
  };
}

/** `count` consecutive days ending on `end`, one finished Special each. */
function streak(player: string, end: string, count: number, over: Partial<RegularsRoundRow> = {}) {
  const rows: RegularsRoundRow[] = [];
  const t = Date.parse(`${end}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    const day = new Date(t - i * 86_400_000).toISOString().slice(0, 10);
    rows.push(special(player, day, over));
  }
  return rows;
}

/** Twenty devices that played once, so a tenth is two devices. */
const onceEach = () => Array.from({ length: 20 }, (_, i) => special(`once-${i}`, "2026-08-10", { guesses: 5 }));

describe("foldRegulars", () => {
  it("takes the top tenth by days played and leaves the rest apart", () => {
    const rows = [
      ...onceEach(),
      ...streak("reg-a", "2026-08-19", 6),
      ...streak("reg-b", "2026-08-19", 4),
      ...streak("reg-c", "2026-08-19", 3),
    ];
    const r = foldRegulars(rows, [], TODAY);
    expect(r.devices).toBe(23);
    expect(r.regulars?.devices).toBe(3);
    expect(r.cutoffDays).toBe(3);
    expect(r.rest.devices).toBe(20);
    expect(r.regulars!.devices + r.rest.devices).toBe(r.devices);
  });

  it("keeps ties at the line in rather than cutting a device at random", () => {
    const rows = [...onceEach(), ...streak("a", "2026-08-19", 3), ...streak("b", "2026-08-19", 3), ...streak("c", "2026-08-19", 3)];
    const r = foldRegulars(rows, [], TODAY);
    expect(r.regulars?.devices).toBe(3);
    expect(r.cutoffDays).toBe(3);
  });

  it("never calls a one-day device a regular, even when nobody has come back", () => {
    const r = foldRegulars(onceEach(), [], TODAY);
    expect(r.regulars).toBeNull();
    expect(r.cutoffDays).toBeNull();
    expect(r.rest.devices).toBe(20);
  });

  it("when fewer than a tenth came back, the regulars are only those who did", () => {
    const r = foldRegulars([...onceEach(), ...streak("back", "2026-08-19", 2)], [], TODAY);
    expect(r.regulars?.devices).toBe(1);
    expect(r.cutoffDays).toBe(2);
  });

  it("measures attendance, wait, streak and recency", () => {
    // Played the 10th, 11th, 12th, then the 18th. Window: 10th..20th = 11 days.
    const days = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-18"];
    const r = foldRegulars(days.map((d) => special("x", d)), [], TODAY);
    const g = r.regulars!;
    expect(g.medianDays).toBe(4);
    expect(g.medianAttendance).toBe(36); // 4 of 11
    expect(g.medianStreak).toBe(3);
    expect(g.medianGap).toBe(1); // waits are 1, 1, 6: lower middle
    expect(g.active).toEqual({ n: 1, of: 1 }); // last seen 2 days ago
  });

  it("calls a device lapsed once a week has passed", () => {
    const r = foldRegulars(streak("old", "2026-08-10", 3), [], TODAY);
    expect(r.regulars!.active).toEqual({ n: 0, of: 1 });
  });

  it("compares guesses on Specials, and on each device's first Special separately", () => {
    // The regular opens badly (5) then gets better (2, 2). The others stay at 5.
    const rows = [
      ...onceEach(),
      special("r", "2026-08-17", { guesses: 5 }),
      special("r", "2026-08-18", { guesses: 2 }),
      special("r", "2026-08-19", { guesses: 2 }),
    ];
    const r = foldRegulars(rows, [], TODAY);
    expect(r.regulars!.special.solvedIn).toEqual([0, 2, 0, 0, 1, 0]);
    expect(r.regulars!.special.firstSolvedIn).toEqual([0, 0, 0, 0, 1, 0]);
    expect(r.rest.special.solvedIn[4]).toBe(20);
  });

  it("counts only Today's Special toward guesses and solve rate", () => {
    const rows = [
      special("p", "2026-08-18"),
      special("p", "2026-08-19"),
      special("p", "2026-08-19", { kind: "leftover", guesses: 1 }),
      special("p", "2026-08-19", { kind: "nightcap", guesses: 1 }),
    ];
    const g = foldRegulars(rows, [], TODAY).regulars!;
    expect(g.special.finished).toBe(2);
    expect(g.special.solvedIn).toEqual([0, 0, 2, 0, 0, 0]);
    expect(g.rounds).toBe(4);
  });

  it("does not count a lost Special as solved, or an unfinished one as finished", () => {
    const rows = [
      special("p", "2026-08-18", { solved: 0, guesses: 6 }),
      special("p", "2026-08-19", { completed: 0, solved: null, guesses: null }),
    ];
    const g = foldRegulars(rows, [], TODAY).regulars!;
    expect(g.special.finished).toBe(1);
    expect(g.special.solved).toEqual({ n: 0, of: 1 });
  });

  it("reports which kinds of round a group has ever tried", () => {
    const rows = [
      ...onceEach(),
      special("r", "2026-08-18"),
      special("r", "2026-08-19"),
      special("r", "2026-08-19", { kind: "leftover" }),
    ];
    const r = foldRegulars(rows, [], TODAY);
    expect(r.regulars!.reach.leftover).toEqual({ n: 1, of: 1 });
    expect(r.regulars!.reach.nightcap).toEqual({ n: 0, of: 1 });
    expect(r.rest.reach.leftover).toEqual({ n: 0, of: 20 });
  });

  it("reads day one off the device's first ET day only", () => {
    const rows = [
      ...onceEach(),
      special("r", "2026-08-17", { shared: 1 }),
      special("r", "2026-08-17", { kind: "random" }),
      special("r", "2026-08-18"),
    ];
    const g = foldRegulars(rows, [], TODAY).regulars!;
    expect(g.dayOne.finished.n).toBe(1);
    expect(g.dayOne.solved.n).toBe(1);
    expect(g.dayOne.shared.n).toBe(1);
    expect(g.dayOne.extra.n).toBe(1);
    expect(foldRegulars(rows, [], TODAY).rest.dayOne.extra.n).toBe(0);
  });

  it("puts the regulars' share of all rounds beside the group", () => {
    const rows = [...onceEach(), ...streak("r", "2026-08-19", 5)];
    const r = foldRegulars(rows, [], TODAY);
    expect(r.roundsShare).toEqual({ n: 5, of: 25 });
  });

  it("counts a device on Discord once, however many rounds", () => {
    const rows = [...streak("r", "2026-08-19", 3, { surface: "discord" })];
    expect(foldRegulars(rows, [], TODAY).regulars!.discord).toEqual({ n: 1, of: 1 });
  });

  it("takes the first-touch source and drops devices from before tracking", () => {
    const rows = [...streak("a", "2026-08-19", 3), ...streak("b", "2026-08-19", 3)];
    const r = foldRegulars(
      rows,
      [
        { player_id: "a", source: "discord" },
        { player_id: "b", source: null },
      ],
      TODAY,
    );
    expect(r.regulars!.sources).toEqual([{ source: "discord", devices: 1 }]);
  });

  it("is an empty, honest report with no rounds", () => {
    const r = foldRegulars([], [], TODAY);
    expect(r.devices).toBe(0);
    expect(r.regulars).toBeNull();
    expect(r.rest.medianDays).toBeNull();
    expect(r.since).toBeNull();
  });
});
