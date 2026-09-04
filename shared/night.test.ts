import { describe, expect, it } from "vitest";
import {
  BAR_CLOSE_HOUR,
  BAR_OPEN_HOUR,
  barIsOpen,
  localClock,
  msUntilLastCall,
  msUntilOpen,
  nightKey,
  nightNumber,
  isPlayableNight,
  type LocalClock,
} from "./night";
import { NIGHT_EPOCH_DATE } from "./types";
import { addDays, gameToday } from "./time";

/**
 * A local wall clock, built by hand. Every test here states an hour and a
 * calendar day and nothing else, so none of it depends on the timezone the
 * suite happens to run in — which is the property the LocalClock type exists
 * to give us.
 */
const at = (day: string, hour: number, minute = 0, second = 0, ms = 0): LocalClock => ({
  year: Number(day.slice(0, 4)),
  month: Number(day.slice(5, 7)),
  day: Number(day.slice(8, 10)),
  hour,
  minute,
  second,
  ms,
});

const HOUR = 3_600_000;

describe("localClock", () => {
  it("reads a Date in the runtime's own zone", () => {
    // Built with the local constructor, so this holds in any TZ the CI box picks.
    const c = localClock(new Date(2026, 8, 4, 21, 30, 15, 250));
    expect(c).toEqual({ year: 2026, month: 9, day: 4, hour: 21, minute: 30, second: 15, ms: 250 });
  });
});

describe("barIsOpen", () => {
  it("opens on the hour and stays open to the end of the evening", () => {
    expect(barIsOpen(at("2026-09-04", BAR_OPEN_HOUR))).toBe(true);
    expect(barIsOpen(at("2026-09-04", 23, 59, 59, 999))).toBe(true);
  });

  it("stays open through midnight and shuts at last call", () => {
    expect(barIsOpen(at("2026-09-05", 0))).toBe(true);
    expect(barIsOpen(at("2026-09-05", 2, 59, 59, 999))).toBe(true);
    expect(barIsOpen(at("2026-09-05", BAR_CLOSE_HOUR))).toBe(false);
  });

  it("is shut through the whole day the diner is open", () => {
    for (const hour of [3, 7, 12, 17, 19]) {
      expect(barIsOpen(at("2026-09-04", hour))).toBe(false);
    }
    expect(barIsOpen(at("2026-09-04", 19, 59, 59, 999))).toBe(false);
  });
});

describe("nightKey", () => {
  it("names the evening's own day once the doors are open", () => {
    expect(nightKey(at("2026-09-04", 20))).toBe("2026-09-04");
    expect(nightKey(at("2026-09-04", 23, 59))).toBe("2026-09-04");
  });

  it("keeps the small hours on the night they started", () => {
    // The whole reason this isn't just a date string: a round begun at 23:50
    // and finished at 00:10 is one sitting on one drink.
    expect(nightKey(at("2026-09-05", 0, 10))).toBe("2026-09-04");
    expect(nightKey(at("2026-09-05", 2, 59, 59, 999))).toBe("2026-09-04");
  });

  it("names the night that is coming once the bar has shut", () => {
    // 03:00 through 19:59 is the diner's day. The countdown on the closed sign
    // counts down to *this* night, so that's the one it names.
    expect(nightKey(at("2026-09-05", 3))).toBe("2026-09-05");
    expect(nightKey(at("2026-09-05", 12))).toBe("2026-09-05");
    expect(nightKey(at("2026-09-05", 19, 59))).toBe("2026-09-05");
  });

  it("walks back over a month boundary", () => {
    expect(nightKey(at("2026-10-01", 1))).toBe("2026-09-30");
  });

  it("walks back over a year boundary", () => {
    expect(nightKey(at("2027-01-01", 2, 30))).toBe("2026-12-31");
  });
});

describe("msUntilOpen", () => {
  it("is zero while the bar is open, in both halves of the window", () => {
    expect(msUntilOpen(at("2026-09-04", 21))).toBe(0);
    expect(msUntilOpen(at("2026-09-05", 1))).toBe(0);
  });

  it("counts down to eight from the afternoon", () => {
    expect(msUntilOpen(at("2026-09-04", 19))).toBe(HOUR);
    expect(msUntilOpen(at("2026-09-04", 17, 30))).toBe(2.5 * HOUR);
  });

  it("counts the long wait from just after last call", () => {
    // 03:00 to 20:00 is seventeen hours, and it must not wrap to a negative.
    expect(msUntilOpen(at("2026-09-05", 3))).toBe(17 * HOUR);
  });
});

describe("msUntilLastCall", () => {
  it("is zero while the bar is shut", () => {
    expect(msUntilLastCall(at("2026-09-04", 12))).toBe(0);
  });

  it("counts across midnight from the evening", () => {
    // 20:00 to 03:00 is seven hours, and the day boundary sits in the middle
    // of it — the one wrap in this module.
    expect(msUntilLastCall(at("2026-09-04", 20))).toBe(7 * HOUR);
    expect(msUntilLastCall(at("2026-09-04", 23))).toBe(4 * HOUR);
  });

  it("counts down within the small hours", () => {
    expect(msUntilLastCall(at("2026-09-05", 1))).toBe(2 * HOUR);
    expect(msUntilLastCall(at("2026-09-05", 2, 59))).toBe(60_000);
  });
});

describe("nightNumber", () => {
  it("numbers the epoch as the first night", () => {
    expect(nightNumber(NIGHT_EPOCH_DATE)).toBe(1);
  });

  it("counts nights, not lunches", () => {
    // Deliberately its own epoch: numbering the first Nightcap off the lunch
    // count would claim nights that never happened. Written relative to the
    // epoch so moving it (which launch day will) doesn't redden this.
    expect(nightNumber(addDays(NIGHT_EPOCH_DATE, 1))).toBe(2);
    expect(nightNumber(addDays(NIGHT_EPOCH_DATE, 30))).toBe(31);
  });
});

describe("NIGHT_EPOCH_DATE", () => {
  // The one test here that reads a real clock, and deliberately so: it is not
  // asserting a fold, it is asserting a fact about the repository that cannot
  // be checked any other way.
  //
  // isPlayableNight refuses every night before the epoch, so an epoch dated
  // into the future does not degrade the bar -- it closes it completely, for
  // everyone, silently. That is not hypothetical: a launch-dated epoch did
  // exactly this during development, and the symptom was a board that loaded
  // and then said the bar was closed at nine at night.
  //
  // It cannot flake. A date already in the past stays in the past, so this only
  // ever goes red for the person who just moved the epoch forward, which is
  // precisely who needs to hear about it.
  it("is never dated into the future, which would close the bar entirely", () => {
    expect(NIGHT_EPOCH_DATE <= gameToday()).toBe(true);
  });
});

describe("isPlayableNight", () => {
  it("serves the night ET agrees it is", () => {
    expect(isPlayableNight("2026-09-20", "2026-09-20")).toBe(true);
  });

  it("serves a night either side, which is every real timezone", () => {
    // A player in Auckland enters their window while ET is still on the
    // previous day; a player in Hawaii is a day behind. Both are legitimate.
    expect(isPlayableNight("2026-09-21", "2026-09-20")).toBe(true);
    expect(isPlayableNight("2026-09-19", "2026-09-20")).toBe(true);
  });

  it("refuses anything further out, so nights can't be read ahead", () => {
    expect(isPlayableNight("2026-09-22", "2026-09-20")).toBe(false);
    expect(isPlayableNight("2026-10-20", "2026-09-20")).toBe(false);
  });

  it("refuses nights before the bar existed", () => {
    // The epoch must sit on or before launch day for exactly this reason: a
    // future one closes the bar completely, which is what a launch-dated epoch
    // did in testing.
    const before = addDays(NIGHT_EPOCH_DATE, -1);
    expect(isPlayableNight(before, NIGHT_EPOCH_DATE)).toBe(false);
    expect(isPlayableNight(NIGHT_EPOCH_DATE, NIGHT_EPOCH_DATE)).toBe(true);
  });

  it("refuses anything that isn't a date", () => {
    expect(isPlayableNight("", "2026-09-20")).toBe(false);
    expect(isPlayableNight("2026-9-20", "2026-09-20")).toBe(false);
    expect(isPlayableNight("tonight", "2026-09-20")).toBe(false);
  });
});
