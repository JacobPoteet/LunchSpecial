import { describe, expect, it } from "vitest";
import { parseSighting } from "./occasions";

const PLAYER = "0b5c2f1e-6b0e-4e6a-9d5b-3f2a1c4d5e6f";
const ok = { occasionId: "halloween", playerId: PLAYER, playDay: "2026-10-30", room: "diner", moment: "seen", surface: "web" };

describe("parseSighting", () => {
  it("accepts a sighting of the costume the day really wore", () => {
    expect(parseSighting(ok, [], "2026-10-30")).toEqual({ sighting: ok });
  });

  it("refuses a costume the calendar didn't put on (an override, a stale tab)", () => {
    expect(parseSighting({ ...ok, playDay: "2026-09-01" }, [], "2026-10-30")).toEqual({ error: "Not in costume that day" });
    const off = [{ occasionId: "halloween" as const, startDate: "2026-10-24", endDate: "2026-10-31", isActive: false }];
    expect(parseSighting(ok, off, "2026-10-30")).toEqual({ error: "Not in costume that day" });
  });

  it("accepts a Leftover from a costumed day replayed later", () => {
    expect(parseSighting(ok, [], "2027-03-01")).toEqual({ sighting: ok });
  });

  it.each([
    [{ ...ok, occasionId: "easter" }, "Unknown occasion"],
    [{ ...ok, playerId: "nope" }, "Invalid player id"],
    [{ ...ok, room: "kitchen" }, "Unknown room"],
    [{ ...ok, moment: "stare" }, "Unknown moment"],
    [{ ...ok, playDay: "2026-11-05" }, "Invalid day"],
  ])("refuses %j", (raw, error) => {
    expect(parseSighting(raw, [], "2026-10-30")).toEqual({ error });
  });

  it("files an unknown surface as web, like every other beacon", () => {
    expect(parseSighting({ ...ok, surface: "fax" }, [], "2026-10-30")).toEqual({ sighting: ok });
  });
});
