import { describe, expect, it } from "vitest";
import { playTimeLabel, playTimeSteps } from "./playtime";

describe("playTimeLabel", () => {
  const total = 3 * 86_400 + 4 * 3_600 + 12 * 60 + 37;

  it("shows every unit down to the second", () => {
    expect(playTimeLabel(total)).toBe("3d 4h 12m 37s");
  });

  it("converts the largest unit into the next on each step", () => {
    expect(playTimeLabel(total, 1)).toBe("76h 12m 37s");
    expect(playTimeLabel(total, 2)).toBe("4,572m 37s");
    expect(playTimeLabel(total, 3)).toBe(`${total.toLocaleString("en-US")}s`);
  });

  it("goes back to the highest after seconds", () => {
    expect(playTimeLabel(total, 4)).toBe("3d 4h 12m 37s");
  });

  it("keeps a zero in the middle", () => {
    expect(playTimeLabel(2 * 86_400 + 5 * 60 + 2)).toBe("2d 0h 5m 2s");
  });

  it("starts at the largest unit a smaller total has", () => {
    expect(playTimeLabel(3_725)).toBe("1h 2m 5s");
    expect(playTimeLabel(3_725, 2)).toBe("3,725s");
    expect(playTimeLabel(59)).toBe("59s");
    expect(playTimeLabel(0)).toBe("0s");
  });
});

describe("playTimeSteps", () => {
  it("counts one reading per unit from the largest down to seconds", () => {
    expect(playTimeSteps(200_000)).toBe(4);
    expect(playTimeSteps(4_000)).toBe(3);
    expect(playTimeSteps(100)).toBe(2);
    expect(playTimeSteps(9)).toBe(1);
    expect(playTimeSteps(0)).toBe(1);
  });
});
