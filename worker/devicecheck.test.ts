import { describe, expect, it } from "vitest";
import { calendarDays, foldDeviceCheck, standingOf, type DeviceKindRow } from "./devicecheck";
import type { RegularsRoundRow } from "./regulars";

// A Thursday.
const TODAY = "2026-08-20";

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

/** `count` consecutive days ending on `end`. */
function run(player: string, end: string, count: number, over: Partial<RegularsRoundRow> = {}) {
  const t = Date.parse(`${end}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    special(player, new Date(t - i * 86_400_000).toISOString().slice(0, 10), over),
  );
}

/** Twenty settled devices that played once, each in five guesses. */
const onceEach = () => Array.from({ length: 20 }, (_, i) => special(`once-${i}`, "2026-08-01", { guesses: 5 }));

const kindRow = (over: Partial<DeviceKindRow> = {}): DeviceKindRow => ({
  kind: "daily",
  surface: "web",
  country: "US",
  rounds: 1,
  finished: 1,
  solved: 1,
  last_at: "2026-08-19 16:00:00",
  ...over,
});

describe("standingOf", () => {
  it("shares a rank on a tie and respects which way is better", () => {
    expect(standingOf(3, [1, 3, 5, 7], false)).toMatchObject({ rank: 3, of: 5, house: 3 });
    expect(standingOf(3, [1, 3, 5, 7], true)).toMatchObject({ rank: 2, of: 5 });
  });

  it("has no rank without a value, and ranks first alone", () => {
    expect(standingOf(null, [1, 2], false)).toMatchObject({ rank: null, of: 2 });
    expect(standingOf(4, [], false)).toMatchObject({ rank: 1, of: 1, house: null });
  });
});

describe("calendarDays", () => {
  it("starts on a Monday and ends today", () => {
    const days = calendarDays(TODAY, 2);
    expect(days[0]).toBe("2026-08-10");
    expect(new Date(`${days[0]}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(days[days.length - 1]).toBe(TODAY);
    expect(days).toHaveLength(11);
  });
});

describe("foldDeviceCheck", () => {
  it("calls a device a regular by the regulars table's own line", () => {
    const rows = [...onceEach(), ...run("me", "2026-08-19", 6), ...run("other", "2026-08-19", 4)];
    const c = foldDeviceCheck("me", rows, [kindRow()], null, TODAY);
    expect(c.standing).toBe("regular");
    expect(c.rank).toBe(1);
    expect(c.devices).toBe(22);
    expect(c.daysPlayed).toBe(6);
  });

  it("leaves this device and unsettled devices out of the house", () => {
    const rows = [...onceEach(), ...run("me", "2026-08-19", 3), special("fresh", "2026-08-18")];
    const c = foldDeviceCheck("me", rows, [], null, TODAY);
    expect(c.house).toBe(20);
    expect(c.standings.daysPlayed).toMatchObject({ value: 3, house: 1, rank: 1, of: 21 });
    expect(c.houseSpecial.finished).toBe(20);
    expect(c.houseSpecial.solvedIn[4]).toBe(20);
  });

  it("ranks fewer guesses higher", () => {
    const rows = [...onceEach(), ...run("me", "2026-08-19", 3, { guesses: 2 })];
    const c = foldDeviceCheck("me", rows, [], null, TODAY);
    expect(c.standings.medianGuesses).toMatchObject({ value: 2, house: 5, rank: 1 });
  });

  it("says new inside the first week and none with no rounds", () => {
    const rows = [...onceEach(), special("me", "2026-08-18")];
    expect(foldDeviceCheck("me", rows, [], null, TODAY).standing).toBe("new");
    const none = foldDeviceCheck("ghost", rows, [], { first_day: "2026-08-19", source: "reddit" }, TODAY);
    expect(none).toMatchObject({ standing: "none", rank: null, daysPlayed: 0, firstVisit: "2026-08-19", source: "reddit" });
    expect(none.standings.daysPlayed.rank).toBeNull();
  });

  it("has no gap for a device that played one day", () => {
    const c = foldDeviceCheck("once-0", onceEach(), [], null, TODAY);
    expect(c.standings.gap.value).toBeNull();
    expect(c.standings.gap.rank).toBeNull();
  });

  it("marks the calendar by what each day held", () => {
    const rows = [
      special("me", "2026-08-17"),
      special("me", "2026-08-18", { kind: "random" }),
      special("me", "2026-08-19", { completed: 0, solved: null, guesses: null }),
    ];
    const c = foldDeviceCheck("me", rows, [], null, TODAY);
    const at = (d: string) => c.calendar.find((x) => x.day === d)?.state;
    expect(at("2026-08-16")).toBe("before");
    expect(at("2026-08-17")).toBe("special");
    expect(at("2026-08-18")).toBe("other");
    expect(at("2026-08-19")).toBe("other");
    expect(at(TODAY)).toBe("off");
  });

  it("totals kinds, countries and surfaces from the device's own rows", () => {
    const c = foldDeviceCheck(
      "me",
      [special("me", "2026-08-19")],
      [
        kindRow({ rounds: 3, finished: 3, solved: 2 }),
        kindRow({ kind: "nightcap", surface: "discord", country: "CA", rounds: 1, finished: 1, solved: 0, last_at: "2026-08-20 02:00:00" }),
        kindRow({ kind: "nightcap", country: "CA", rounds: 2, finished: 1, solved: 1 }),
      ],
      null,
      TODAY,
    );
    expect(c.kinds.daily).toEqual({ rounds: 3, finished: 3, solved: 2 });
    expect(c.kinds.nightcap).toEqual({ rounds: 3, finished: 2, solved: 1 });
    expect(c.kinds.leftover.rounds).toBe(0);
    expect(c.countries).toEqual(["CA", "US"]);
    expect(c.surfaces).toEqual(["discord", "web"]);
    expect(c.lastAt).toBe("2026-08-20T02:00:00Z");
  });
});
