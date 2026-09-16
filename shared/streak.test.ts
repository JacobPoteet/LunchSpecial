import { describe, expect, it } from "vitest";
import { boardStreakMark, checkStreakLine, liveStreak } from "./streak";

const today = "2026-09-16";

describe("liveStreak", () => {
  it("is the stored count when the last round was today", () => {
    expect(liveStreak({ currentStreak: 5, lastCompletedDate: today, today })).toBe(5);
  });

  it("is the stored count when the last round was yesterday", () => {
    expect(liveStreak({ currentStreak: 5, lastCompletedDate: "2026-09-15", today })).toBe(5);
  });

  it("is over once a day has been skipped, whatever storage says", () => {
    expect(liveStreak({ currentStreak: 5, lastCompletedDate: "2026-09-14", today })).toBe(0);
  });

  it("is zero for a device that has never finished a round", () => {
    expect(liveStreak({ currentStreak: 0, lastCompletedDate: null, today })).toBe(0);
  });

  it("survives a month boundary", () => {
    expect(liveStreak({ currentStreak: 3, lastCompletedDate: "2026-08-31", today: "2026-09-01" })).toBe(3);
  });
});

describe("boardStreakMark", () => {
  it("says nothing at zero or one", () => {
    expect(boardStreakMark({ currentStreak: 0, lastCompletedDate: null, today })).toBeNull();
    expect(boardStreakMark({ currentStreak: 1, lastCompletedDate: today, today })).toBeNull();
  });

  it("marks a live streak of two or more", () => {
    expect(boardStreakMark({ currentStreak: 2, lastCompletedDate: "2026-09-15", today })).toBe("🔥 2-day streak");
    expect(boardStreakMark({ currentStreak: 12, lastCompletedDate: today, today })).toBe("🔥 12-day streak");
  });

  it("says nothing about a dead streak", () => {
    expect(boardStreakMark({ currentStreak: 9, lastCompletedDate: "2026-09-01", today })).toBeNull();
  });
});

describe("checkStreakLine", () => {
  it("asks a winner with a streak to keep it", () => {
    expect(checkStreakLine({ won: true, currentStreak: 4, lastCompletedDate: today, today })).toBe(
      "Come back tomorrow to keep your 4-day streak going.",
    );
  });

  it("asks a first-time winner to start one", () => {
    expect(checkStreakLine({ won: true, currentStreak: 1, lastCompletedDate: today, today })).toBe(
      "Come back tomorrow to start a streak.",
    );
  });

  it("tells a loser tomorrow starts fresh, without the number", () => {
    const line = checkStreakLine({ won: false, currentStreak: 0, lastCompletedDate: today, today });
    expect(line).toBe("Tomorrow's Special starts a new streak.");
    expect(line).not.toMatch(/\d/);
  });
});
