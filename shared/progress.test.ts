import { describe, expect, it } from "vitest";
import { MAX_PROGRESS_BYTES, mergeProgress, normalizeProgress, PROGRESS_KEYS, type Progress } from "./progress";

const STATS = "lunch-special:stats";
const ROUND = "lunch-special:round";
const ARCHIVE = "lunch-special:archive";

const stats = (played: number, last: string, streak = 1) =>
  JSON.stringify({ played, wins: played, currentStreak: streak, maxStreak: streak, dist: [0, 0, played, 0, 0, 0], lastCompletedDate: last });

describe("mergeProgress", () => {
  it("takes the server's copy when the phone has nothing (the cold launch this exists for)", () => {
    const server: Progress = { [STATS]: stats(9, "2026-10-17", 9), "lunch-special:howto-seen": "1" };
    expect(mergeProgress({}, server)).toEqual(server);
  });

  it("keeps the phone's copy when the server has nothing", () => {
    const phone: Progress = { [STATS]: stats(1, "2026-10-18") };
    expect(mergeProgress(phone, {})).toEqual(phone);
  });

  it("keeps the stats with the later completed day, never a sum", () => {
    const old = stats(9, "2026-10-17", 9);
    const fresh = stats(1, "2026-10-18", 1);
    expect(mergeProgress({ [STATS]: fresh }, { [STATS]: old })[STATS]).toBe(fresh);
    expect(mergeProgress({ [STATS]: old }, { [STATS]: fresh })[STATS]).toBe(fresh);
  });

  it("merging a copy with itself changes nothing", () => {
    const copy: Progress = {
      [STATS]: stats(3, "2026-10-18", 3),
      [ARCHIVE]: JSON.stringify({ "2026-10-18": { date: "2026-10-18", status: "won", guesses: [1, 2, 3] } }),
      "lunch-special:announcements": "[4,5]",
    };
    expect(mergeProgress(copy, copy)).toEqual(copy);
  });

  it("prefers the later day's round, then a finished one over one in progress", () => {
    const today = JSON.stringify({ date: "2026-10-18", status: "playing", guesses: [1] });
    const done = JSON.stringify({ date: "2026-10-18", status: "won", guesses: [1, 2, 3] });
    const yesterday = JSON.stringify({ date: "2026-10-17", status: "won", guesses: [1] });
    expect(mergeProgress({ [ROUND]: today }, { [ROUND]: done })[ROUND]).toBe(done);
    expect(mergeProgress({ [ROUND]: yesterday }, { [ROUND]: today })[ROUND]).toBe(today);
  });

  it("unions the archive by date", () => {
    const a = JSON.stringify({ "2026-10-16": { status: "won", guesses: [1] } });
    const b = JSON.stringify({ "2026-10-17": { status: "lost", guesses: [1, 2, 3, 4, 5, 6] } });
    const merged = JSON.parse(mergeProgress({ [ARCHIVE]: a }, { [ARCHIVE]: b })[ARCHIVE]!);
    expect(Object.keys(merged).sort()).toEqual(["2026-10-16", "2026-10-17"]);
  });

  it("sets a seen-flag when either side has it", () => {
    expect(mergeProgress({}, { "lunch-special:howto-seen": "1" })["lunch-special:howto-seen"]).toBe("1");
  });

  it("carries the Kids Menu's coach card flag, so a phone that lost it isn't coached twice", () => {
    expect(PROGRESS_KEYS).toContain("lunch-special:kids-menu-seen");
    expect(mergeProgress({}, { "lunch-special:kids-menu-seen": "1" })["lunch-special:kids-menu-seen"]).toBe("1");
    expect(mergeProgress({ "lunch-special:kids-menu-seen": "1" }, {})["lunch-special:kids-menu-seen"]).toBe("1");
    expect(normalizeProgress({ "lunch-special:kids-menu-seen": "1" })).toEqual({ "lunch-special:kids-menu-seen": "1" });
  });

  it("keeps the Kids Menu scratchpad with the board it was written on", () => {
    const board = (n: number, crossed: number[]) =>
      JSON.stringify({ date: "2026-10-26", status: "playing", guesses: Array(n).fill({}), kidsMenu: { crossed, peeks: {} } });
    const merged = JSON.parse(mergeProgress({ [ROUND]: board(4, [1]) }, { [ROUND]: board(5, [1, 2]) })[ROUND]!);
    expect(merged.kidsMenu.crossed).toEqual([1, 2]);
  });

  it("falls back to the readable side when one copy is corrupted", () => {
    const good = stats(2, "2026-10-18");
    expect(mergeProgress({ [STATS]: "{nope" }, { [STATS]: good })[STATS]).toBe(good);
  });
});

describe("normalizeProgress", () => {
  it("keeps known keys with string values and drops everything else", () => {
    expect(
      normalizeProgress({ [STATS]: "{}", "lunch-special:player": "abc", "lunch-special:howto-seen": 1 }),
    ).toEqual({ [STATS]: "{}" });
  });

  it("refuses a non-object and an oversize body", () => {
    expect(normalizeProgress(null)).toBeNull();
    expect(normalizeProgress([])).toBeNull();
    expect(normalizeProgress({ [STATS]: "x".repeat(MAX_PROGRESS_BYTES + 1) })).toBeNull();
  });

  it("never lets the device id travel", () => {
    expect(normalizeProgress({ "lunch-special:player": "abc" })).toEqual({});
  });
});
