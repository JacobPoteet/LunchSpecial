import { describe, expect, it } from "vitest";
import { guessRecord, isAnalyticsId, type GuessRecordInput } from "./guesslog";

const base: GuessRecordInput = {
  roundId: "round-12345678",
  playerId: "player-12345678",
  guessNumber: 2,
  catalogue: "dish",
  guessedId: 7,
  targetId: 51,
  rehearsal: false,
};

describe("guessRecord", () => {
  it("records a tracked guess as sent", () => {
    expect(guessRecord(base)).toEqual({
      roundId: "round-12345678",
      playerId: "player-12345678",
      guessNumber: 2,
      catalogue: "dish",
      guessedId: 7,
      targetId: 51,
      fromKidsMenu: false,
    });
  });

  it("records nothing when the client named no round", () => {
    expect(guessRecord({ ...base, roundId: undefined })).toBeNull();
  });

  it.each([["short", "abc"], ["long", "x".repeat(65)], ["not a string", 12345678]])(
    "drops a %s round id",
    (_, roundId) => {
      expect(guessRecord({ ...base, roundId })).toBeNull();
    },
  );

  it("keeps the guess but stores no device when the device id is unusable", () => {
    expect(guessRecord({ ...base, playerId: "abc" })?.playerId).toBeNull();
    expect(guessRecord({ ...base, playerId: undefined })?.playerId).toBeNull();
  });

  it("records nothing in a preview, a showcase or a playtest, whatever the client sent", () => {
    expect(guessRecord({ ...base, rehearsal: true })).toBeNull();
  });

  it("keeps the catalogue so a drink is never written as a dish", () => {
    expect(guessRecord({ ...base, catalogue: "drink" })?.catalogue).toBe("drink");
  });
});

describe("isAnalyticsId", () => {
  it("holds an id to 8-64 characters", () => {
    expect(isAnalyticsId("x".repeat(8))).toBe(true);
    expect(isAnalyticsId("x".repeat(64))).toBe(true);
    expect(isAnalyticsId("x".repeat(7))).toBe(false);
    expect(isAnalyticsId("x".repeat(65))).toBe(false);
    expect(isAnalyticsId(null)).toBe(false);
  });

  it("flags a guess ordered off the Kids' Menu, only where the card could have been open", () => {
    expect(guessRecord({ ...base, guessNumber: 5, fromKidsMenu: true })?.fromKidsMenu).toBe(true);
    expect(guessRecord({ ...base, guessNumber: 6, fromKidsMenu: true })?.fromKidsMenu).toBe(true);
    // Before the fifth guess there is no card to order from.
    expect(guessRecord({ ...base, guessNumber: 4, fromKidsMenu: true })?.fromKidsMenu).toBe(false);
    // Only a literal true counts, and the bar has no Kids' Menu.
    expect(guessRecord({ ...base, guessNumber: 5, fromKidsMenu: "yes" })?.fromKidsMenu).toBe(false);
    expect(guessRecord({ ...base, guessNumber: 5, catalogue: "drink", fromKidsMenu: true })?.fromKidsMenu).toBe(false);
  });
});
