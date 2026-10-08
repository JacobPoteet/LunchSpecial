import { describe, expect, it } from "vitest";
import { guessRecord, type GuessRecordInput } from "./guesslog";

const base: GuessRecordInput = {
  roundId: "round-12345678",
  guessNumber: 2,
  catalogue: "dish",
  guessedId: 7,
  targetId: 51,
  correct: false,
  rehearsal: [undefined, undefined],
};

describe("guessRecord", () => {
  it("records a tracked guess as sent", () => {
    expect(guessRecord(base)).toEqual({
      roundId: "round-12345678",
      guessNumber: 2,
      catalogue: "dish",
      guessedId: 7,
      targetId: 51,
      correct: false,
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

  it("records nothing in a preview or a playtest, whatever the client sent", () => {
    expect(guessRecord({ ...base, rehearsal: ["token", undefined] })).toBeNull();
    expect(guessRecord({ ...base, rehearsal: [undefined, "ramen"] })).toBeNull();
  });

  it("keeps the catalogue so a drink is never written as a dish", () => {
    expect(guessRecord({ ...base, catalogue: "drink" })?.catalogue).toBe("drink");
  });
});
