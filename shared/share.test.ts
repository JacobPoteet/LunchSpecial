import { describe, expect, it } from "vitest";
import {
  buildNightShareText,
  buildShareText,
  joinShareBlocks,
  shareMessage,
  SHARE_URL,
  wantsNativeShare,
} from "./share";
import type { DrinkGuessFeedback, GuessFeedback } from "./types";

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

// ---- the two grids ----

const lunchGuess = (over: Partial<GuessFeedback> = {}): GuessFeedback => ({
  correct: false,
  dish: { id: 1, name: "Ramen" },
  matchedIngredients: ["egg", "pork"],
  unmatchedIngredients: ["noodles"],
  attributes: {
    country: { value: "Japan", match: "near" },
    course: { value: "entree", match: "hit" },
    temperature: { value: "hot", match: "hit" },
    protein: { value: "pork", match: "miss" },
  },
  ...over,
});

const nightGuess = (over: Partial<DrinkGuessFeedback> = {}): DrinkGuessFeedback => ({
  correct: false,
  drink: { id: 1, name: "Negroni" },
  matchedIngredients: ["gin"],
  unmatchedIngredients: ["campari"],
  attributes: {
    country: { value: "Italy", match: "hit" },
    spirit: { value: "gin", match: "miss" },
    temperature: { value: "cold", match: "near" },
    profile: { value: "bitter", match: "miss" },
  },
  ...over,
});

describe("buildShareText", () => {
  it("prints the score out of six and a row per guess", () => {
    const text = buildShareText(26, [lunchGuess(), lunchGuess({ correct: true })], true, 6);
    expect(text.split("\n")).toEqual(["Lunch Special #26 — 2/6", "🟨🟩🟩⬜ 2/6🥄", "🟨🟩🟩⬜ 🛎️"]);
  });

  it("prints X for a round that ran out", () => {
    expect(buildShareText(26, [lunchGuess()], false, 6)).toContain("X/6");
  });

  it("carries no url of its own", () => {
    // shareMessage appends it once, to the whole message. A grid that carried
    // its own would put two in a combined share.
    expect(buildShareText(26, [lunchGuess()], false, 6)).not.toContain(SHARE_URL);
  });
});

describe("buildNightShareText", () => {
  it("prints the score out of four, never six", () => {
    const text = buildNightShareText(12, [nightGuess(), nightGuess({ correct: true })], true, 5);
    expect(text.split("\n")[0]).toBe("After Dark · Night #12 — 2/4");
  });

  it("blacks out the misses so a Nightcap reads as one at a glance", () => {
    // The single difference from the lunch grid, and the whole reason a channel
    // with both pasted in it stays legible: green and yellow keep their
    // meanings, the white square goes out.
    const row = buildNightShareText(12, [nightGuess()], false, 5).split("\n")[1];
    expect(row).toContain("⬛");
    expect(row).not.toContain("⬜");
  });

  it("pours a glass for the winning guess and counts the pantry otherwise", () => {
    const rows = buildNightShareText(12, [nightGuess(), nightGuess({ correct: true })], true, 5).split("\n");
    expect(rows[1]).toContain("1/5🥃");
    expect(rows[2]).toContain("🥂");
    expect(rows[2]).not.toContain("🥃");
  });

  it("drops the number on an unnumbered round rather than printing Night #0", () => {
    expect(buildNightShareText(0, [nightGuess()], false, 5)).toMatch(/^After Dark — X\/4/);
  });

  it("never names the drink", () => {
    // Only the drinks the player themselves guessed appear, which is the same
    // rule the board follows. The target is not an input here at all.
    expect(buildNightShareText(12, [nightGuess({ correct: true })], true, 5)).not.toContain("Negroni");
  });
});

describe("joinShareBlocks", () => {
  it("stacks both grids with one blank line between them", () => {
    expect(joinShareBlocks(["a", "b"])).toBe("a\n\nb");
  });

  it("passes a lone grid through untouched", () => {
    // The lunch check shares one block and the tab shares two; one call, and no
    // trailing gap on the single case.
    expect(joinShareBlocks(["a"])).toBe("a");
  });

  it("drops empty and absent blocks rather than printing them as gaps", () => {
    expect(joinShareBlocks([null, "a", undefined, "", "   ", "b"])).toBe("a\n\nb");
  });

  it("puts one url on a combined message, not one per grid", () => {
    const message = shareMessage(
      joinShareBlocks([
        buildShareText(54, [lunchGuess({ correct: true })], true, 6),
        buildNightShareText(12, [nightGuess({ correct: true })], true, 5),
      ]),
    );
    expect(message.split(SHARE_URL).length - 1).toBe(1);
    expect(message.endsWith(SHARE_URL)).toBe(true);
    // And both scores survive, which is the thing a player is actually sharing.
    expect(message).toContain("Lunch Special #54 — 1/6");
    expect(message).toContain("After Dark · Night #12 — 1/4");
  });
});
