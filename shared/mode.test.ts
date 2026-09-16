import { describe, expect, it } from "vitest";
import { isPastPuzzleDate, resolveMode, type ModeInput } from "./mode";
import { EPOCH_DATE } from "./types";

const today = "2026-09-16";
const at = (search: string, over: Partial<ModeInput> = {}) =>
  resolveMode({ search, pathname: "/", dev: false, today, ...over });

// The CLAUDE.md round-modes table, one row per test.
describe("resolveMode: the table", () => {
  it("Today's Special: / — saved, counted, tracked, dressed as itself", () => {
    const m = at("");
    expect(m.mode).toBe("daily");
    expect(m).toMatchObject({ isDaily: true, ephemeral: false, tracked: true, dressedAsDaily: true, date: today });
    expect(m.analyticsKind).toBe("daily");
  });

  it("Leftovers: ?date=<past> — saved per date, counted, not dressed as the daily", () => {
    const m = at("?date=2026-08-01");
    expect(m.mode).toBe("archive");
    expect(m).toMatchObject({ isArchive: true, isDaily: false, ephemeral: false, tracked: true, dressedAsDaily: false });
    expect(m.date).toBe("2026-08-01");
    expect(m.analyticsKind).toBe("leftover");
  });

  it("Chef's Choice: ?random — nothing saved, still counted", () => {
    const m = at("?random=abc");
    expect(m.mode).toBe("random");
    expect(m).toMatchObject({ isRandom: true, ephemeral: true, tracked: true, dressedAsDaily: false });
    expect(m.analyticsKind).toBe("random");
  });

  it("Preview: ?preview=<token> — nothing saved, nothing counted, dressed as the daily", () => {
    const m = at("?preview=tok");
    expect(m.mode).toBe("preview");
    expect(m.preview).toBe("tok");
    expect(m).toMatchObject({ isPreview: true, ephemeral: true, tracked: false, dressedAsDaily: true, isDaily: false });
  });

  it("Playtest: ?special=<slug> — dev only, otherwise ignored", () => {
    const dev = at("?special=ramen", { dev: true });
    expect(dev.mode).toBe("playtest");
    expect(dev.playtest).toBe("ramen");
    expect(dev).toMatchObject({ ephemeral: true, tracked: false, dressedAsDaily: true, isDaily: false });
    const prod = at("?special=ramen");
    expect(prod.mode).toBe("daily");
    expect(prod.playtest).toBeUndefined();
  });

  it("Showcase: ?s=<token> — the daily, nothing saved, nothing counted", () => {
    const m = at("?s=tok");
    expect(m.mode).toBe("showcase");
    expect(m).toMatchObject({ isShowcase: true, isDaily: true, ephemeral: true, tracked: false, dressedAsDaily: true });
    expect(m.date).toBe(today);
  });
});

describe("resolveMode: precedence", () => {
  it("a preview token beats a playtest slug, a date and a seed", () => {
    const m = at("?preview=tok&special=ramen&date=2026-08-01&random=x", { dev: true });
    expect(m.mode).toBe("preview");
    expect(m.playtest).toBeUndefined();
    expect(m.isArchive).toBe(false);
    expect(m.isRandom).toBe(false);
  });

  it("a playtest slug beats a date and a seed", () => {
    expect(at("?special=ramen&date=2026-08-01&random=x", { dev: true }).mode).toBe("playtest");
  });

  it("a past date beats a seed", () => {
    expect(at("?date=2026-08-01&random=x").mode).toBe("archive");
  });

  it("a date that isn't a past puzzle falls through", () => {
    expect(at("?date=2026-09-16").mode).toBe("daily"); // today
    expect(at("?date=2026-12-25").mode).toBe("daily"); // future
    expect(at("?date=2020-01-01").mode).toBe("daily"); // before the epoch
    expect(at("?date=nonsense&random=x").mode).toBe("random");
  });
});

describe("resolveMode: the dev entrances", () => {
  it("opens /play and ?freeplay as Chef's Choice in dev only", () => {
    expect(at("", { dev: true, pathname: "/play" }).isRandom).toBe(true);
    expect(at("?freeplay", { dev: true }).isRandom).toBe(true);
    expect(at("", { pathname: "/play" }).isRandom).toBe(false);
    expect(at("?freeplay").isRandom).toBe(false);
  });

  it("takes the search with or without its question mark", () => {
    expect(at("random=x").isRandom).toBe(true);
  });
});

describe("isPastPuzzleDate", () => {
  it("runs from the epoch up to yesterday", () => {
    expect(isPastPuzzleDate(EPOCH_DATE, today)).toBe(true);
    expect(isPastPuzzleDate("2026-09-15", today)).toBe(true);
    expect(isPastPuzzleDate(today, today)).toBe(false);
    expect(isPastPuzzleDate("2026-07-16", today)).toBe(false);
    expect(isPastPuzzleDate("yesterday", today)).toBe(false);
  });
});
