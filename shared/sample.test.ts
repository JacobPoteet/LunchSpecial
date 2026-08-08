import { describe, expect, it } from "vitest";
import { isSmallSample, medianOf, percentileOf, rangeLabel, rate, separated, SMALL_SAMPLE_MIN } from "./sample";

describe("rate", () => {
  it("returns null for a measurement never made", () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(3, -1)).toBeNull();
  });

  it("rounds the point estimate the way the dashboard prints it", () => {
    expect(rate(2, 3)?.pct).toBe(67);
    expect(rate(1, 2)?.pct).toBe(50);
  });

  it("brackets the point estimate", () => {
    const r = rate(20, 40)!;
    expect(r.low).toBeLessThanOrEqual(r.pct);
    expect(r.high).toBeGreaterThanOrEqual(r.pct);
  });

  it("narrows as the sample grows, around the same proportion", () => {
    const thin = rate(2, 3)!;
    const thick = rate(200, 300)!;
    expect(thin.pct).toBe(thick.pct);
    expect(thin.high - thin.low).toBeGreaterThan(thick.high - thick.low);
  });

  // The whole reason for Wilson: the normal approximation gives a zero-width
  // interval at 0 and 1, which is the most confident thing a dashboard can say
  // and also the most wrong.
  it("keeps a real interval at the extremes and stays inside 0..100", () => {
    const none = rate(0, 4)!;
    expect(none.pct).toBe(0);
    expect(none.low).toBe(0);
    expect(none.high).toBeGreaterThan(0);

    const all = rate(4, 4)!;
    expect(all.pct).toBe(100);
    expect(all.high).toBe(100);
    expect(all.low).toBeLessThan(100);
  });

  it("clamps a denominator smaller than its numerator rather than exceeding 100%", () => {
    // Start and complete are independent beacons, so a completion whose start
    // never landed can briefly outrun starts — the same race FinishRate guards.
    expect(rate(5, 4)?.pct).toBe(100);
  });

  it("flags the sample as small strictly under the threshold", () => {
    expect(rate(1, SMALL_SAMPLE_MIN - 1)?.small).toBe(true);
    expect(rate(1, SMALL_SAMPLE_MIN)?.small).toBe(false);
  });
});

describe("isSmallSample", () => {
  it("treats nothing-measured as not a small sample, but a different thing", () => {
    expect(isSmallSample(0)).toBe(false);
    expect(isSmallSample(1)).toBe(true);
    expect(isSmallSample(SMALL_SAMPLE_MIN)).toBe(false);
  });
});

describe("rangeLabel", () => {
  it("labels only the samples thin enough to need it", () => {
    expect(rangeLabel(rate(2, 3))).toMatch(/^\d+–\d+%$/);
    expect(rangeLabel(rate(200, 300))).toBeNull();
    expect(rangeLabel(null)).toBeNull();
  });
});

describe("separated", () => {
  it("stays quiet when either side was never measured", () => {
    expect(separated(rate(2, 3), null)).toBe(false);
    expect(separated(null, null)).toBe(false);
  });

  it("refuses to call two thin samples different", () => {
    expect(separated(rate(3, 4), rate(1, 4))).toBe(false);
  });

  it("calls a genuine gap different", () => {
    expect(separated(rate(90, 100), rate(20, 100))).toBe(true);
  });
});

describe("medianOf", () => {
  it("returns null when nothing was observed", () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf([[4, 0]])).toBeNull();
  });

  it("finds the middle of a weighted distribution", () => {
    // 1,1,1, 2,2, 5 → 6 values, lower middle is the 3rd = 1
    expect(medianOf([[1, 3], [2, 2], [5, 1]])).toBe(1);
    // 1, 2,2,2, 9 → 5 values, middle is the 3rd = 2
    expect(medianOf([[1, 1], [2, 3], [9, 1]])).toBe(2);
  });

  it("sorts by value, not by the order rows arrived in", () => {
    expect(medianOf([[9, 1], [1, 1], [4, 1]])).toBe(4);
  });

  it("takes a real observed value on an even count rather than averaging", () => {
    expect(medianOf([[2, 1], [8, 1]])).toBe(2);
  });

  // A single round left open in a tab overnight is a real row; it must not drag
  // the reported typical solve time with it.
  it("ignores an outlier a mean would follow", () => {
    expect(medianOf([[3, 20], [900, 1]])).toBe(3);
  });
});

describe("percentileOf", () => {
  it("returns null when nothing was observed", () => {
    expect(percentileOf([], 0.9)).toBeNull();
  });

  it("takes the nearest rank, not an interpolation", () => {
    const pairs = [[1, 1], [2, 1], [3, 1], [4, 1], [100, 1]] as const;
    expect(percentileOf(pairs, 0.9)).toBe(100);
    expect(percentileOf(pairs, 0.5)).toBe(3);
  });

  it("clamps to the ends rather than running off either", () => {
    const pairs = [[5, 2], [7, 2]] as const;
    expect(percentileOf(pairs, 0)).toBe(5);
    expect(percentileOf(pairs, 1)).toBe(7);
  });
});
