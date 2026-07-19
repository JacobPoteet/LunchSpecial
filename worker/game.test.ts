import { describe, expect, it } from "vitest";
import { gameHour, gameToday, msUntilGameMidnight } from "../shared/time";
import type { DishRecord } from "./game";
import {
  computeFeedback,
  fallbackDishIndex,
  isAllowedRequestDate,
  isArchiveDate,
  isPlayableDate,
  isValidDateString,
  puzzleNumber,
} from "./game";

const carbonara: DishRecord = {
  id: 1,
  name: "Spaghetti Carbonara",
  country: "Italy",
  region: "europe",
  course: "entree",
  temperature: "hot",
  protein: "pork",
  ingredients: ["pasta", "egg", "pecorino", "guanciale", "black pepper"],
};

const ramen: DishRecord = {
  id: 38,
  name: "Ramen",
  country: "Japan",
  region: "east-asia",
  course: "entree",
  temperature: "hot",
  protein: "pork",
  ingredients: ["noodles", "pork", "egg", "scallion", "soy sauce", "miso", "seaweed", "garlic"],
};

const croque: DishRecord = {
  id: 6,
  name: "Croque Monsieur",
  country: "France",
  region: "europe",
  course: "entree",
  temperature: "hot",
  protein: "pork",
  ingredients: ["bread", "ham", "gruyere", "butter", "milk", "flour", "mustard"],
};

describe("computeFeedback", () => {
  it("marks the exact dish correct with all ingredients matched", () => {
    const fb = computeFeedback(carbonara, carbonara);
    expect(fb.correct).toBe(true);
    expect(fb.matchedIngredients).toEqual(carbonara.ingredients);
    expect(fb.unmatchedIngredients).toEqual([]);
    expect(fb.attributes.country.match).toBe("hit");
  });

  it("computes ingredient intersection", () => {
    const fb = computeFeedback(ramen, carbonara);
    expect(fb.correct).toBe(false);
    expect(fb.matchedIngredients).toEqual(["egg"]);
    expect(fb.unmatchedIngredients).toContain("noodles");
    expect(fb.unmatchedIngredients).not.toContain("egg");
  });

  it("scores country near when regions match but countries differ", () => {
    const fb = computeFeedback(croque, carbonara);
    expect(fb.attributes.country).toEqual({ value: "France", match: "near" });
    expect(fb.attributes.course.match).toBe("hit");
    expect(fb.attributes.protein.match).toBe("hit");
  });

  it("scores country miss across regions", () => {
    const fb = computeFeedback(ramen, croque);
    expect(fb.attributes.country.match).toBe("miss");
  });
});

describe("puzzleNumber", () => {
  it("is 1 on the epoch date and counts up", () => {
    expect(puzzleNumber("2026-07-17")).toBe(1);
    expect(puzzleNumber("2026-07-18")).toBe(2);
    expect(puzzleNumber("2026-08-16")).toBe(31);
  });
});

describe("date validation", () => {
  it("accepts real dates and rejects malformed or impossible ones", () => {
    expect(isValidDateString("2026-07-17")).toBe(true);
    expect(isValidDateString("2026-2-3")).toBe(false);
    expect(isValidDateString("2026-02-31")).toBe(false);
    expect(isValidDateString("not-a-date")).toBe(false);
  });

  it("accepts dates within a day of now and rejects distant ones", () => {
    const now = new Date("2026-07-17T12:00:00Z");
    expect(isAllowedRequestDate("2026-07-17", now)).toBe(true);
    expect(isAllowedRequestDate("2026-07-18", now)).toBe(true);
    expect(isAllowedRequestDate("2026-07-16", now)).toBe(true);
    expect(isAllowedRequestDate("2026-07-25", now)).toBe(false);
    expect(isAllowedRequestDate("2025-01-01", now)).toBe(false);
  });

  it("treats archive dates as the epoch through today, never the future", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    expect(isArchiveDate("2026-07-17", now)).toBe(true); // epoch (puzzle #1)
    expect(isArchiveDate("2026-07-25", now)).toBe(true); // a past puzzle
    expect(isArchiveDate("2026-08-01", now)).toBe(true); // today
    expect(isArchiveDate("2026-07-16", now)).toBe(false); // before the epoch
    expect(isArchiveDate("2026-08-02", now)).toBe(false); // the future — no spoilers
    expect(isArchiveDate("not-a-date", now)).toBe(false);
  });

  it("plays today (with tz slack) and any past puzzle, but not the far future", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    expect(isPlayableDate("2026-07-17", now)).toBe(true); // old archive puzzle
    expect(isPlayableDate("2026-08-01", now)).toBe(true); // today
    expect(isPlayableDate("2026-08-02", now)).toBe(true); // tomorrow (tz slack)
    expect(isPlayableDate("2026-08-10", now)).toBe(false); // far future
    expect(isPlayableDate("2026-07-16", now)).toBe(false); // before the epoch
  });
});

describe("midnight-ET rollover (GitHub #33)", () => {
  it("resolves 'today' in Eastern Time, not UTC", () => {
    // 03:00 UTC is still the previous evening (23:00 EDT) in New York.
    expect(gameToday(new Date("2026-07-19T03:00:00Z"))).toBe("2026-07-18");
    // 05:00 UTC has crossed midnight ET (01:00 EDT) into the new day.
    expect(gameToday(new Date("2026-07-19T05:00:00Z"))).toBe("2026-07-19");
    // Winter (EST, UTC-5): 04:30 UTC is 23:30 EST the day before.
    expect(gameToday(new Date("2026-01-15T04:30:00Z"))).toBe("2026-01-14");
  });

  it("counts down to the next midnight ET", () => {
    // 04:00 UTC = 00:00 EDT exactly — a fresh full day remains.
    expect(msUntilGameMidnight(new Date("2026-07-19T04:00:00Z"))).toBe(86_400_000);
    // 05:30 UTC = 01:30 EDT — 22h30m left in the ET day.
    expect(msUntilGameMidnight(new Date("2026-07-19T05:30:00Z"))).toBe(22.5 * 3_600_000);
  });

  it("buckets an instant into its ET hour of day", () => {
    // 18:30 UTC in July (EDT, UTC-4) is 14:30 ET.
    expect(gameHour(new Date("2026-07-19T18:30:00Z"))).toBe(14);
    // 02:30 UTC in July is the prior ET evening, 22:30 EDT.
    expect(gameHour(new Date("2026-07-19T02:30:00Z"))).toBe(22);
    // Winter (EST, UTC-5): 18:30 UTC is 13:30 ET.
    expect(gameHour(new Date("2026-01-15T18:30:00Z"))).toBe(13);
  });

  it("accepts the ET date near the UTC-day boundary", () => {
    // Just before midnight ET on 07-18 (03:59 UTC on the 19th): the player's ET
    // date is the 18th and must still be playable even though UTC says the 19th.
    const now = new Date("2026-07-19T03:59:00Z");
    expect(isAllowedRequestDate("2026-07-18", now)).toBe(true);
    expect(isArchiveDate("2026-07-19", now)).toBe(false); // not "today" in ET yet — no spoiler
  });
});

describe("fallbackDishIndex", () => {
  it("is deterministic and in range", () => {
    const a = fallbackDishIndex("2026-09-01", 68);
    expect(a).toBe(fallbackDishIndex("2026-09-01", 68));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(68);
    // Different dates should generally land on different dishes.
    expect(fallbackDishIndex("2026-09-02", 68)).not.toBe(fallbackDishIndex("2026-09-03", 68));
  });
});
