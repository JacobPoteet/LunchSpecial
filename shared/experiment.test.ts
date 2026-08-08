import { describe, expect, it } from "vitest";
import { compare, summarise, TARGET_LIFT } from "./experiment";
import type { ExperimentDay } from "./types";

/** A day of the series. Everything defaults to a quiet, fully-tracked day. */
const day = (date: string, over: Partial<ExperimentDay> = {}): ExperimentDay => ({
  date,
  started: 0,
  completed: 0,
  solved: 0,
  shared: 0,
  players: 0,
  newPlayers: 0,
  ...over,
});

/** `n` consecutive days from `start`, each built by `make`. */
function run(start: string, n: number, make: (i: number) => Partial<ExperimentDay>): ExperimentDay[] {
  const out: ExperimentDay[] = [];
  const base = Date.parse(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.push(day(new Date(base + i * 86_400_000).toISOString().slice(0, 10), make(i)));
  }
  return out;
}

describe("summarise", () => {
  it("reports nothing for an empty period", () => {
    expect(summarise("started", [])).toMatchObject({ days: 0, value: null, n: 0 });
    expect(summarise("winRate", [])).toMatchObject({ value: null, n: 0 });
  });

  it("means a count metric across its days", () => {
    const s = summarise("started", [day("2026-08-01", { started: 10 }), day("2026-08-02", { started: 20 })]);
    expect(s.value).toBe(15);
    expect(s.n).toBe(30);
    expect(s.days).toBe(2);
    expect(s.sd).toBeCloseTo(7.071, 2);
  });

  // The classic way to let a quiet Tuesday outvote a whole weekend.
  it("pools a rate rather than averaging daily percentages", () => {
    const days = [
      day("2026-08-01", { completed: 1, solved: 1 }), // 100% on one round
      day("2026-08-02", { completed: 60, solved: 30 }), // 50% on sixty
    ];
    const s = summarise("winRate", days);
    // Pooled: 31/61 = 51%. Averaging the two days would have said 75%.
    expect(s.value).toBe(51);
    expect(s.n).toBe(61);
  });

  it("drops untracked days from a count instead of counting them as zero", () => {
    const s = summarise("players", [
      day("2026-08-01", { players: null }),
      day("2026-08-02", { players: 8 }),
      day("2026-08-03", { players: 12 }),
    ]);
    expect(s.days).toBe(2);
    expect(s.value).toBe(10);
  });

  it("gives a single day no spread rather than NaN", () => {
    expect(summarise("started", [day("2026-08-01", { started: 5 })]).sd).toBe(0);
  });
});

describe("compare", () => {
  const today = "2026-08-31";

  it("puts the ship day itself in the after period", () => {
    const series = run("2026-08-01", 10, () => ({ started: 5 }));
    const c = compare("started", series, "2026-08-06", 3, today);
    // Before = 3rd, 4th, 5th. After = 6th, 7th, 8th.
    expect(c.before.days).toBe(3);
    expect(c.after.days).toBe(3);
  });

  it("clips the after window at today rather than padding it", () => {
    const series = run("2026-08-01", 12, () => ({ started: 5 }));
    const c = compare("started", series, "2026-08-10", 14, "2026-08-12");
    expect(c.after.days).toBe(3); // 10th, 11th, 12th
  });

  it("is inconclusive with nothing on one side", () => {
    const series = run("2026-08-10", 5, () => ({ started: 5 }));
    const c = compare("started", series, "2026-08-10", 7, today);
    expect(c.before.value).toBeNull();
    expect(c.verdict).toBe("inconclusive");
  });

  it("is inconclusive on a single day either side, however different", () => {
    const series = [day("2026-08-05", { started: 1 }), day("2026-08-06", { started: 900 })];
    const c = compare("started", series, "2026-08-06", 1, today);
    expect(c.verdict).toBe("inconclusive");
  });

  // The whole point of the module: a wobble is not a result.
  it("calls a difference smaller than the day-to-day swing no change", () => {
    // Before averages 20 with a big spread; after averages 23. Noise.
    const before = run("2026-08-01", 7, (i) => ({ started: [8, 32, 12, 28, 15, 25, 20][i] }));
    const after = run("2026-08-08", 7, (i) => ({ started: [10, 35, 14, 30, 18, 27, 27][i] }));
    const c = compare("started", [...before, ...after], "2026-08-08", 7, today);
    expect(c.verdict).toBe("no-change");
    expect(c.relative).toBeGreaterThan(0); // it did go up — that isn't the question
  });

  it("calls a difference much bigger than the swing a move", () => {
    const before = run("2026-08-01", 7, () => ({ started: 20 }));
    const after = run("2026-08-08", 7, () => ({ started: 200 }));
    const c = compare("started", [...before, ...after], "2026-08-08", 7, today);
    expect(c.verdict).toBe("moved-up");
    expect(c.relative).toBeCloseTo(9, 5);
  });

  it("detects a drop as well as a rise", () => {
    const before = run("2026-08-01", 7, () => ({ started: 200 }));
    const after = run("2026-08-08", 7, () => ({ started: 20 }));
    expect(compare("started", [...before, ...after], "2026-08-08", 7, today).verdict).toBe("moved-down");
  });

  it("compares two identical flat periods as no change", () => {
    const series = run("2026-08-01", 14, () => ({ started: 20 }));
    expect(compare("started", series, "2026-08-08", 7, today).verdict).toBe("no-change");
  });

  describe("rate metrics", () => {
    it("refuses to call a thin rate difference a move", () => {
      // 75% vs 50%, but on four rounds each: a 25-point swing that one player
      // changing their mind would erase.
      const before = run("2026-08-01", 4, (i) => ({ completed: 1, solved: i === 3 ? 0 : 1 }));
      const after = run("2026-08-05", 4, (i) => ({ completed: 1, solved: i < 2 ? 1 : 0 }));
      const c = compare("winRate", [...before, ...after], "2026-08-05", 4, today);
      expect(c.before.value).toBe(75);
      expect(c.after.value).toBe(50);
      expect(c.verdict).toBe("no-change");
    });

    // The flip side, and the reason the thin case above isn't just "small n is
    // always no": total separation on a handful each is a real result, and the
    // test has to be able to find one.
    it("calls a perfectly separated rate a move even on modest counts", () => {
      const before = run("2026-08-01", 7, () => ({ completed: 1, solved: 1 }));
      const after = run("2026-08-08", 7, () => ({ completed: 1, solved: 0 }));
      expect(compare("winRate", [...before, ...after], "2026-08-08", 7, today).verdict).toBe("moved-down");
    });

    it("calls a well-measured rate difference a move", () => {
      const before = run("2026-08-01", 7, () => ({ completed: 100, solved: 90 }));
      const after = run("2026-08-08", 7, () => ({ completed: 100, solved: 40 }));
      expect(compare("winRate", [...before, ...after], "2026-08-08", 7, today).verdict).toBe("moved-down");
    });

    it("is inconclusive when the denominator is empty", () => {
      const series = run("2026-08-01", 14, () => ({ completed: 0, solved: 0 }));
      const c = compare("winRate", series, "2026-08-08", 7, today);
      expect(c.before.value).toBeNull();
      expect(c.verdict).toBe("inconclusive");
    });
  });

  describe("sensitivity", () => {
    it("says how many more days an undecided count comparison needs", () => {
      const before = run("2026-08-01", 7, (i) => ({ started: [18, 22, 19, 21, 20, 23, 17][i] }));
      const after = run("2026-08-08", 2, () => ({ started: 21 }));
      const c = compare("started", [...before, ...after], "2026-08-08", 7, "2026-08-09");
      expect(c.verdict).toBe("no-change");
      expect(c.daysNeeded).not.toBeNull();
      expect(c.daysNeeded).toBeGreaterThan(0);
    });

    it("needs longer to see the same lift on a noisier metric", () => {
      const calm = run("2026-08-01", 7, () => ({ started: 20 }));
      const wild = run("2026-08-01", 7, (i) => ({ started: [2, 40, 3, 38, 5, 35, 17][i] }));
      const after = run("2026-08-08", 2, () => ({ started: 20 }));
      const calmNeeds = compare("started", [...calm, ...after], "2026-08-08", 7, "2026-08-09").daysNeeded;
      const wildNeeds = compare("started", [...wild, ...after], "2026-08-08", 7, "2026-08-09").daysNeeded;
      // A flat baseline has no spread to project from at all; a wild one has a number.
      expect(calmNeeds).toBeNull();
      expect(wildNeeds).toBeGreaterThan(0);
    });

    it("scales the projection with how much traffic a rate is measured on", () => {
      const quiet = run("2026-08-01", 7, () => ({ completed: 4, solved: 2 }));
      const busy = run("2026-08-01", 7, () => ({ completed: 400, solved: 200 }));
      const after = run("2026-08-08", 1, () => ({ completed: 4, solved: 2 }));
      const quietNeeds = compare("winRate", [...quiet, ...after], "2026-08-08", 7, "2026-08-08").daysNeeded!;
      const busyNeeds = compare("winRate", [...busy, ...after], "2026-08-08", 7, "2026-08-08").daysNeeded!;
      expect(quietNeeds).toBeGreaterThan(busyNeeds);
    });

    it("offers no projection once the answer is already in", () => {
      const before = run("2026-08-01", 7, () => ({ started: 20 }));
      const after = run("2026-08-08", 7, () => ({ started: 200 }));
      expect(compare("started", [...before, ...after], "2026-08-08", 7, today).daysNeeded).toBeNull();
    });

    it("projects against the stated target lift, not an arbitrary one", () => {
      expect(TARGET_LIFT).toBeGreaterThan(0);
      expect(TARGET_LIFT).toBeLessThan(1);
    });
  });
});
