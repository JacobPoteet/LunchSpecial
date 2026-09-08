import { describe, expect, it } from "vitest";
import {
  DRINK_PREVIEW_PREFIX,
  SHOWCASE_PAYLOAD,
  SHOWCASE_TTL_DAYS,
  classifyDrinkPreview,
  showcaseTtlMs,
} from "./showcase";

describe("showcaseTtlMs", () => {
  it("signs every lifetime it offers", () => {
    for (const days of SHOWCASE_TTL_DAYS) {
      expect(showcaseTtlMs(days)).toBe(days * 86_400_000);
    }
  });

  it("refuses a lifetime it does not offer, rather than clamping to one", () => {
    // A 400 is the point: quietly issuing a week to someone who asked for a
    // year is a dead link discovered by the person you sent it to.
    expect(showcaseTtlMs(365)).toBeNull();
    expect(showcaseTtlMs(1)).toBeNull();
    expect(showcaseTtlMs(0)).toBeNull();
    expect(showcaseTtlMs(-7)).toBeNull();
  });

  it("refuses anything that is not a whole number of days", () => {
    expect(showcaseTtlMs(7.5)).toBeNull();
    expect(showcaseTtlMs("7")).toBe(7 * 86_400_000); // a JSON body of "7" is 7
    expect(showcaseTtlMs("seven")).toBeNull();
    expect(showcaseTtlMs(undefined)).toBeNull();
    expect(showcaseTtlMs(null)).toBeNull();
    expect(showcaseTtlMs({})).toBeNull();
  });
});

describe("classifyDrinkPreview", () => {
  it("reads a showcase payload", () => {
    expect(classifyDrinkPreview(SHOWCASE_PAYLOAD)).toEqual({ kind: "showcase" });
  });

  it("reads a drink preview and its id", () => {
    expect(classifyDrinkPreview(`${DRINK_PREVIEW_PREFIX}42`)).toEqual({ kind: "drink", id: 42 });
  });

  it("rejects a dish token aimed at the bar", () => {
    // The daily's payload is `preview:<dishId>`. It must not parse here, or a
    // token minted for the kitchen would pour a drink.
    expect(classifyDrinkPreview("preview:51")).toEqual({ kind: "invalid" });
  });

  it("rejects an unverifiable token", () => {
    expect(classifyDrinkPreview(null)).toEqual({ kind: "invalid" });
  });

  it("matches the showcase exactly, so no longer prefix falls through to it", () => {
    // If a `preview:bartender:…` payload were ever minted, it must not be read
    // as a showcase. Exact equality is what guarantees that.
    expect(classifyDrinkPreview("preview:bar:7")).toEqual({ kind: "invalid" });
    expect(classifyDrinkPreview("preview:bartender")).toEqual({ kind: "invalid" });
  });

  it("rejects a drink preview with no usable id", () => {
    expect(classifyDrinkPreview(DRINK_PREVIEW_PREFIX)).toEqual({ kind: "invalid" });
    expect(classifyDrinkPreview(`${DRINK_PREVIEW_PREFIX}abc`)).toEqual({ kind: "invalid" });
  });
});
