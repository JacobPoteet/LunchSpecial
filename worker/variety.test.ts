import { describe, expect, it } from "vitest";
import { fillVaried, pickVaried, restTier, varietyPenalty, type Booking, type VarietyCandidate } from "./variety";

const dish = (
  id: number,
  region: VarietyCandidate["region"],
  course: VarietyCandidate["course"],
  country: string,
  lastServed: string | null = null,
): VarietyCandidate => ({ id, region, course, country, lastServed });

const booked = (date: string, c: VarietyCandidate): Booking => ({
  date,
  region: c.region,
  course: c.course,
  country: c.country,
});

const pho = dish(1, "southeast-asia", "entree", "Vietnam");
const padThai = dish(2, "southeast-asia", "entree", "Thailand");
const carbonara = dish(3, "europe", "entree", "Italy");
const tiramisu = dish(4, "europe", "dessert", "Italy");
const flan = dish(5, "latin-america", "dessert", "Mexico");
const tacos = dish(6, "latin-america", "entree", "Mexico");

const day = "2026-09-20";

describe("restTier", () => {
  it("puts never-served and long-rested dishes in the same tier", () => {
    expect(restTier(pho, day)).toBe(2);
    expect(restTier({ ...pho, lastServed: "2026-01-01" }, day)).toBe(2);
  });

  it("ranks a dish rested under the threshold below them", () => {
    expect(restTier({ ...pho, lastServed: "2026-07-01" }, day)).toBe(1);
  });
});

describe("varietyPenalty", () => {
  it("is zero on an empty board, less the bonus for an unseen course", () => {
    expect(varietyPenalty(pho, [], day)).toBe(-1);
  });

  it("charges the same region as yesterday most", () => {
    const board = [booked("2026-09-19", pho)];
    expect(varietyPenalty(padThai, board, day)).toBe(3);
    // An entrée after an entrée: no clash, and no bonus either.
    expect(varietyPenalty(carbonara, board, day)).toBe(0);
  });

  it("charges the same region two days back a little", () => {
    const board = [booked("2026-09-18", pho)];
    expect(varietyPenalty(padThai, board, day)).toBe(1);
  });

  it("charges a country back inside two weeks, either side", () => {
    expect(varietyPenalty(tacos, [booked("2026-09-08", flan)], day)).toBe(4 - 1);
    expect(varietyPenalty(tacos, [booked("2026-10-03", flan)], day)).toBe(4 - 1);
    expect(varietyPenalty(tacos, [booked("2026-09-05", flan)], day)).toBe(-1);
  });

  it("keeps two desserts apart but never rations entrées", () => {
    expect(varietyPenalty(flan, [booked("2026-09-19", tiramisu)], day)).toBe(2);
    expect(varietyPenalty(tacos, [booked("2026-09-19", carbonara)], day)).toBe(0);
  });

  it("rewards a course the last ten days went without", () => {
    const board = [booked("2026-09-14", carbonara), booked("2026-09-19", pho)];
    expect(varietyPenalty(flan, board, day)).toBe(-1);
    expect(varietyPenalty(tacos, board, day)).toBe(0);
  });
});

describe("pickVaried", () => {
  it("prefers variety over id order among well-rested dishes", () => {
    const board = [booked("2026-09-19", pho)];
    expect(pickVaried([padThai, carbonara], board, day)?.id).toBe(carbonara.id);
  });

  it("prefers a well-rested clash over a fresh perfect fit", () => {
    const fresh = { ...carbonara, lastServed: "2026-08-01" };
    const board = [booked("2026-09-19", pho)];
    expect(pickVaried([padThai, fresh], board, day)?.id).toBe(padThai.id);
  });

  it("breaks a tie on rest, never-served first, then id", () => {
    const rested = { ...carbonara, lastServed: "2025-01-01" };
    expect(pickVaried([rested, tacos], [], day)?.id).toBe(tacos.id);
    expect(pickVaried([tacos, { ...tacos, id: 99 }], [], day)?.id).toBe(tacos.id);
  });

  it("is null with nothing to pick", () => {
    expect(pickVaried([], [], day)).toBeNull();
  });
});

describe("fillVaried", () => {
  it("books each day seeing the day before it, and never the same dish twice", () => {
    const made = fillVaried([pho, padThai, carbonara, tacos], [], ["2026-09-20", "2026-09-21", "2026-09-22"]);
    expect(made.map((m) => m.id)).toEqual([pho.id, carbonara.id, tacos.id]);
    expect(new Set(made.map((m) => m.id)).size).toBe(3);
    for (let i = 1; i < made.length; i++) expect(made[i].region).not.toBe(made[i - 1].region);
  });

  it("stops when the pool runs out", () => {
    expect(fillVaried([pho], [], ["2026-09-20", "2026-09-21"])).toHaveLength(1);
  });
});
