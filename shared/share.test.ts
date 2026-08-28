import { describe, expect, it } from "vitest";
import { shareMessage, SHARE_URL, wantsNativeShare } from "./share";

const GRID = ["Lunch Special #26 — 3/6", "🟩🟨⬜⬜ 2/6🥄", "🟩🟩⬜🟩 4/6🥄", "🟩🟩🟩🟩 🛎️"].join("\n");

describe("shareMessage", () => {
  it("keeps the whole grid and adds the url on its own line", () => {
    expect(shareMessage(GRID)).toBe(`${GRID}\n${SHARE_URL}`);
  });

  // The regression this whole path exists for: the url used to ride in Web
  // Share's separate `url` field, and Windows' share sheet delivered that field
  // alone — a bare link, no score. Everything must be in the one string.
  it("is a single string, so no target can deliver the link without the score", () => {
    const message = shareMessage(GRID);
    expect(message).toContain(SHARE_URL);
    for (const row of GRID.split("\n")) expect(message).toContain(row);
  });

  it("leaves a lost round's X/6 intact", () => {
    expect(shareMessage("Lunch Special #26 — X/6")).toContain("X/6");
  });
});

describe("wantsNativeShare", () => {
  const phone = { hasShare: true, coarsePointer: true, canShareText: true };

  it("takes the sheet on a phone", () => {
    expect(wantsNativeShare(phone)).toBe(true);
  });

  // The desktop bug. Chrome and Edge on Windows have `navigator.share`; what it
  // opens is not a share sheet anyone wants for a puzzle grid.
  it("refuses the sheet on a mouse-driven desktop that has the API", () => {
    expect(wantsNativeShare({ ...phone, coarsePointer: false })).toBe(false);
  });

  // A touchscreen laptop is a desktop with a screen you can poke — its primary
  // pointer is the mouse, which is why the check is `pointer` not `any-pointer`.
  it("refuses the sheet on a touchscreen laptop", () => {
    expect(wantsNativeShare({ hasShare: true, coarsePointer: false, canShareText: true })).toBe(false);
  });

  it("refuses the sheet where the API is absent", () => {
    expect(wantsNativeShare({ ...phone, hasShare: false })).toBe(false);
  });

  it("honours an explicit refusal from canShare", () => {
    expect(wantsNativeShare({ ...phone, canShareText: false })).toBe(false);
  });

  // `canShare` shipped after `share` itself, so a browser lacking it hasn't
  // refused anything — treating the gap as a no would strand older phones on
  // the clipboard.
  it("treats a missing canShare as no answer rather than a refusal", () => {
    expect(wantsNativeShare({ ...phone, canShareText: null })).toBe(true);
  });
});
