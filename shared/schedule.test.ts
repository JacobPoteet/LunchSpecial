import { describe, expect, it } from "vitest";
import {
  buildBoard,
  DISH_MATCH_LIMIT,
  matchDishes,
  REPEAT_WINDOW_DAYS,
  resolveDishName,
  summarizeBoard,
  type BoardRow,
} from "./schedule";
import type { AdminDishRow, ScheduleEntry } from "./types";

const TODAY = "2026-09-10";

const dish = (over: Partial<AdminDishRow> = {}): AdminDishRow => ({
  id: 1,
  name: "Ramen",
  slug: "ramen",
  country: "Japan",
  region: "east-asia",
  course: "entree",
  temperature: "hot",
  protein: "pork",
  ingredients: ["noodle", "pork", "egg"],
  isActive: true,
  isFanSubmission: false,
  clueCount: 5,
  lastServed: null,
  nextBooked: null,
  timesServed: 0,
  schedulable: true,
  ...over,
});

const entry = (date: string, dishId: number | null = null, dishName: string | null = null): ScheduleEntry => ({
  date,
  dishId,
  dishName,
});

const byDate = (rows: BoardRow[], date: string): BoardRow => {
  const row = rows.find((r) => r.date === date);
  if (!row) throw new Error(`no row for ${date}`);
  return row;
};

describe("buildBoard", () => {
  it("joins the catalogue row onto the booking", () => {
    const rows = buildBoard([entry(TODAY, 1, "Ramen")], [dish()], TODAY);
    expect(rows[0].dish?.country).toBe("Japan");
    expect(rows[0].dish?.course).toBe("entree");
  });

  it("keeps the schedule's own name when the catalogue has no matching dish", () => {
    // The dishes fetch is allowed to fail on its own; the board still names the
    // Special it is showing.
    const rows = buildBoard([entry(TODAY, 7, "Borscht")], [], TODAY);
    expect(rows[0].dish).toBeNull();
    expect(rows[0].dishName).toBe("Borscht");
  });

  it("splits past, today and future", () => {
    const rows = buildBoard([entry("2026-09-09"), entry(TODAY), entry("2026-09-11")], [], TODAY);
    expect(rows.map((r) => [r.isPast, r.isToday])).toEqual([
      [true, false],
      [false, true],
      [false, false],
    ]);
  });

  describe("rest", () => {
    it("reports nothing for a day with no dish", () => {
      const rows = buildBoard([entry(TODAY)], [dish()], TODAY);
      expect(rows[0].restDays).toBeNull();
      expect(rows[0].restSide).toBeNull();
      expect(rows[0].tooSoon).toBe(false);
    });

    it("reports nothing for a dish served exactly once on the board", () => {
      const rows = buildBoard([entry(TODAY, 1, "Ramen")], [dish()], TODAY);
      expect(rows[0].restDays).toBeNull();
      expect(rows[0].tooSoon).toBe(false);
    });

    it("measures the gap to another booking in the window", () => {
      const rows = buildBoard(
        [entry(TODAY, 1, "Ramen"), entry("2026-09-14", 1, "Ramen")],
        [dish()],
        TODAY,
      );
      expect(byDate(rows, TODAY).restDays).toBe(4);
      expect(byDate(rows, TODAY).restSide).toBe("after");
      // Both ends of the collision say so, each pointing at the other.
      expect(byDate(rows, "2026-09-14").restSide).toBe("before");
      expect(byDate(rows, "2026-09-14").restDate).toBe(TODAY);
    });

    it("takes the nearest serving when the dish is on the board more than twice", () => {
      const rows = buildBoard(
        [entry("2026-09-01", 1, "Ramen"), entry(TODAY, 1, "Ramen"), entry("2026-09-12", 1, "Ramen")],
        [dish()],
        TODAY,
      );
      expect(byDate(rows, TODAY).restDays).toBe(2);
      expect(byDate(rows, TODAY).restDate).toBe("2026-09-12");
    });

    it("sees a serving that happened before the window opens", () => {
      // The whole point of reading lastServed: a dish served three days before
      // the first visible row would otherwise report as never served.
      const rows = buildBoard([entry(TODAY, 1, "Ramen")], [dish({ lastServed: "2026-09-07" })], TODAY);
      expect(rows[0].restDays).toBe(3);
      expect(rows[0].restSide).toBe("before");
      expect(rows[0].tooSoon).toBe(true);
    });

    it("sees a booking beyond the far end of the window", () => {
      const rows = buildBoard([entry(TODAY, 1, "Ramen")], [dish({ nextBooked: "2026-11-01" })], TODAY);
      expect(rows[0].restDays).toBe(52);
      expect(rows[0].restSide).toBe("after");
    });

    it("does not count the row's own booking as a repeat of itself", () => {
      // lastServed is computed against today, so a dish booked on today reports
      // today. Measuring that as a zero-day gap would flag every current Special.
      const rows = buildBoard([entry(TODAY, 1, "Ramen")], [dish({ lastServed: TODAY })], TODAY);
      expect(rows[0].restDays).toBeNull();
      expect(rows[0].tooSoon).toBe(false);
    });

    it("flags a gap inside the repeat window and clears one outside it", () => {
      const near = buildBoard(
        [entry(TODAY, 1, "Ramen")],
        [dish({ lastServed: "2026-07-14" })], // 58 days
        TODAY,
      );
      const far = buildBoard(
        [entry(TODAY, 1, "Ramen")],
        [dish({ lastServed: "2026-07-12" })], // 60 days
        TODAY,
      );
      expect(near[0].restDays).toBe(58);
      expect(near[0].tooSoon).toBe(true);
      expect(far[0].restDays).toBe(REPEAT_WINDOW_DAYS);
      expect(far[0].tooSoon).toBe(false);
    });

    it("keeps two different dishes on adjacent days apart", () => {
      const rows = buildBoard(
        [entry(TODAY, 1, "Ramen"), entry("2026-09-11", 2, "Pho")],
        [dish(), dish({ id: 2, name: "Pho" })],
        TODAY,
      );
      expect(rows.every((r) => r.restDays === null)).toBe(true);
    });
  });
});

describe("summarizeBoard", () => {
  const rows = (entries: ScheduleEntry[]) => buildBoard(entries, [dish()], TODAY);

  it("counts gaps and bookings from today forward", () => {
    const b = summarizeBoard(
      rows([entry(TODAY, 1, "Ramen"), entry("2026-09-11"), entry("2026-09-12", 1, "Ramen"), entry("2026-09-13")]),
    );
    expect(b).toEqual({ emptyAhead: 2, firstGap: "2026-09-11", bookedAhead: 2 });
  });

  it("ignores past days, empty or not", () => {
    // A day nobody booked last week ran on the fallback pick and is settled.
    const b = summarizeBoard(rows([entry("2026-09-08"), entry("2026-09-09"), entry(TODAY, 1, "Ramen")]));
    expect(b).toEqual({ emptyAhead: 0, firstGap: null, bookedAhead: 1 });
  });

  it("reports no gap on a full board", () => {
    const b = summarizeBoard(rows([entry(TODAY, 1, "Ramen"), entry("2026-09-11", 1, "Ramen")]));
    expect(b.firstGap).toBeNull();
    expect(b.emptyAhead).toBe(0);
  });
});

describe("resolveDishName", () => {
  const all = [dish(), dish({ id: 2, name: "Pho" })];

  it("matches ignoring case and surrounding space", () => {
    expect(resolveDishName("  ramen ", all)?.id).toBe(1);
  });

  it("refuses a name nothing matches", () => {
    expect(resolveDishName("Tacos", all)).toBeNull();
  });

  it("refuses an empty name rather than picking the first dish", () => {
    expect(resolveDishName("   ", all)).toBeNull();
  });

  it("refuses a name two dishes share", () => {
    // Booking the wrong one silently is worse than asking for a rename.
    expect(resolveDishName("Pho", [...all, dish({ id: 3, name: "Pho" })])).toBeNull();
  });
});

describe("matchDishes", () => {
  // Names chosen so "pho" hits one at the front and one in the middle, and so a
  // country string ("Japan") appears in no dish name.
  const all = [
    dish({ id: 1, name: "Katsu Curry", country: "Japan" }),
    dish({ id: 2, name: "Pho", country: "Vietnam" }),
    dish({ id: 3, name: "Ramen", country: "Japan" }),
    dish({ id: 4, name: "Shepherd's Pie", country: "United Kingdom" }),
  ];

  it("offers the head of the catalogue on an empty query", () => {
    // Focusing the field should show what the control does, not an empty box.
    expect(matchDishes("", all, 2).map((d) => d.name)).toEqual(["Katsu Curry", "Pho"]);
  });

  it("matches a substring of the name, ignoring case", () => {
    expect(matchDishes("RAM", all).map((d) => d.name)).toEqual(["Ramen"]);
  });

  it("puts names that start with the query ahead of names that contain it", () => {
    expect(matchDishes("p", all).map((d) => d.name)).toEqual(["Pho", "Shepherd's Pie"]);
  });

  it("searches names and not countries", () => {
    // A native <datalist> searched the country too, so typing three letters
    // filled the list with dishes whose names had nothing to do with the query.
    expect(matchDishes("japan", all)).toEqual([]);
  });

  it("ignores surrounding space", () => {
    expect(matchDishes("  pho  ", all).map((d) => d.name)).toEqual(["Pho"]);
  });

  it("returns nothing when no name matches", () => {
    expect(matchDishes("zzz", all)).toEqual([]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 40 }, (_, i) => dish({ id: i + 1, name: `Soup ${i}` }));
    expect(matchDishes("soup", many)).toHaveLength(DISH_MATCH_LIMIT);
    expect(matchDishes("soup", many, 3)).toHaveLength(3);
  });
});
