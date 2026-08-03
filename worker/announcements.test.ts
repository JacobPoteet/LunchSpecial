import { describe, expect, it } from "vitest";
import { announcementStatus, isEligible, parseAnnouncementInput, type AnnouncementWindow } from "./announcements";
import { markdownToText, parseMarkdown, safeHref } from "../shared/markdown";
import { ANNOUNCEMENT_LIMITS } from "../shared/types";

const window = (over: Partial<AnnouncementWindow> = {}): AnnouncementWindow => ({
  startDate: "2026-07-20",
  endDate: "2026-07-22",
  isActive: true,
  ...over,
});

describe("announcementStatus", () => {
  it("treats both ends of the window as inclusive", () => {
    expect(announcementStatus(window(), "2026-07-20")).toBe("active");
    expect(announcementStatus(window(), "2026-07-21")).toBe("active");
    expect(announcementStatus(window(), "2026-07-22")).toBe("active");
  });

  it("sorts a notice around its window", () => {
    expect(announcementStatus(window(), "2026-07-19")).toBe("upcoming");
    expect(announcementStatus(window(), "2026-07-23")).toBe("past");
  });

  it("runs a single-day notice on exactly that day", () => {
    const oneDay = window({ startDate: "2026-08-01", endDate: "2026-08-01" });
    expect(announcementStatus(oneDay, "2026-07-31")).toBe("upcoming");
    expect(announcementStatus(oneDay, "2026-08-01")).toBe("active");
    expect(announcementStatus(oneDay, "2026-08-02")).toBe("past");
  });

  it("lets the kill switch outrank the dates", () => {
    // Mid-window, but pulled by hand: retired, not active.
    expect(announcementStatus(window({ isActive: false }), "2026-07-21")).toBe("retired");
    expect(announcementStatus(window({ isActive: false }), "2026-07-19")).toBe("retired");
  });
});

describe("isEligible", () => {
  const all = { ...window(), audience: "all" as const };
  const returning = { ...window(), audience: "returning" as const };

  it("shows an 'all' notice to anyone while it's running", () => {
    expect(isEligible(all, { today: "2026-07-21", returning: false })).toBe(true);
    expect(isEligible(all, { today: "2026-07-21", returning: true })).toBe(true);
  });

  it("withholds a 'returning' notice from a first-time player", () => {
    expect(isEligible(returning, { today: "2026-07-21", returning: false })).toBe(false);
    expect(isEligible(returning, { today: "2026-07-21", returning: true })).toBe(true);
  });

  it("never shows a notice outside its window, whoever is asking", () => {
    expect(isEligible(all, { today: "2026-07-19", returning: true })).toBe(false);
    expect(isEligible(all, { today: "2026-07-23", returning: true })).toBe(false);
    expect(isEligible({ ...all, isActive: false }, { today: "2026-07-21", returning: true })).toBe(false);
  });
});

describe("parseAnnouncementInput", () => {
  const valid = {
    header: "New dishes on the menu",
    body: "Thirty new Specials just landed.",
    audience: "all",
    startDate: "2026-07-20",
    endDate: "2026-07-22",
    isActive: true,
  };

  it("accepts a well-formed notice", () => {
    const out = parseAnnouncementInput(valid);
    expect(out).toEqual({ input: valid });
  });

  it("trims whitespace and defaults audience + kill switch", () => {
    const out = parseAnnouncementInput({ ...valid, header: "  Hi  ", audience: undefined, isActive: undefined });
    expect(out).toEqual({
      input: { ...valid, header: "Hi", audience: "all", isActive: true },
    });
  });

  it("caps overlong fields instead of rejecting the draft", () => {
    const out = parseAnnouncementInput({ ...valid, header: "x".repeat(200), body: "y".repeat(5000) });
    expect("input" in out && out.input.header).toHaveLength(ANNOUNCEMENT_LIMITS.header);
    expect("input" in out && out.input.body).toHaveLength(ANNOUNCEMENT_LIMITS.body);
  });

  it("requires a header and a message", () => {
    expect(parseAnnouncementInput({ ...valid, header: "   " })).toEqual({ error: "A header is required" });
    expect(parseAnnouncementInput({ ...valid, body: "" })).toEqual({ error: "A message is required" });
  });

  it("rejects bad dates and a backwards window", () => {
    expect(parseAnnouncementInput({ ...valid, startDate: "20-07-2026" })).toHaveProperty("error");
    expect(parseAnnouncementInput({ ...valid, endDate: "2026-02-31" })).toHaveProperty("error");
    expect(parseAnnouncementInput({ ...valid, startDate: "2026-07-22", endDate: "2026-07-20" })).toEqual({
      error: "The end date can't be before the start date",
    });
  });

  it("allows a same-day window", () => {
    expect(parseAnnouncementInput({ ...valid, startDate: "2026-07-20", endDate: "2026-07-20" })).toHaveProperty("input");
  });

  it("rejects an audience outside the enum", () => {
    expect(parseAnnouncementInput({ ...valid, audience: "vip" })).toEqual({ error: "Unknown audience" });
  });

  it("survives junk input", () => {
    expect(parseAnnouncementInput(null)).toHaveProperty("error");
    expect(parseAnnouncementInput({ header: 42, body: [] })).toHaveProperty("error");
  });
});

describe("parseMarkdown", () => {
  it("splits blank-line-separated paragraphs, keeping single newlines as breaks", () => {
    const out = parseMarkdown("one\ntwo\n\nthree");
    expect(out).toHaveLength(2);
    expect(out[0].lines).toHaveLength(2);
    expect(out[1].lines).toHaveLength(1);
  });

  it("parses bold, italic and links into spans", () => {
    expect(parseMarkdown("a **b** c")[0].lines[0]).toEqual([
      { type: "text", text: "a " },
      { type: "strong", text: "b" },
      { type: "text", text: " c" },
    ]);
    expect(parseMarkdown("*hey* and _you_")[0].lines[0]).toEqual([
      { type: "em", text: "hey" },
      { type: "text", text: " and " },
      { type: "em", text: "you" },
    ]);
    expect(parseMarkdown("[the menu](/?date=2026-07-17)")[0].lines[0]).toEqual([
      { type: "link", text: "the menu", href: "/?date=2026-07-17" },
    ]);
  });

  it("prefers bold over italic so ** never matches as an empty run", () => {
    expect(parseMarkdown("**loud**")[0].lines[0]).toEqual([{ type: "strong", text: "loud" }]);
  });

  it("leaves unmatched markup as the characters the author typed", () => {
    // A lone pair of asterisks still reads as emphasis — that's the trade for a
    // parser this small, and the text survives either way.
    expect(parseMarkdown("2 * 3 * 4 = 24")[0].lines[0]).toEqual([
      { type: "text", text: "2 " },
      { type: "em", text: " 3 " },
      { type: "text", text: " 4 = 24" },
    ]);
    expect(parseMarkdown("a ** b")[0].lines[0]).toEqual([{ type: "text", text: "a ** b" }]);
  });

  it("returns nothing for an empty or whitespace-only body", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n  \n")).toEqual([]);
  });

  it("degrades an unsafe link to its own label rather than rendering it", () => {
    // The renderer builds React nodes, so this could never execute — but a
    // javascript: URL shouldn't be clickable-looking either.
    expect(parseMarkdown("[click](javascript:alert)")[0].lines[0]).toEqual([{ type: "text", text: "click" }]);
    expect(parseMarkdown("[x](//evil.example)")[0].lines[0]).toEqual([{ type: "text", text: "x" }]);
    // The href run stops at the first ")", so a parenthesised payload leaves a
    // stray ")" behind — still no link span, which is the part that matters.
    expect(parseMarkdown("[click](javascript:alert(1))")[0].lines[0].some((s) => s.type === "link")).toBe(false);
  });
});

describe("safeHref", () => {
  it("takes absolute http(s) and same-site paths", () => {
    expect(safeHref("https://lunchspecial.app")).toBe("https://lunchspecial.app");
    expect(safeHref("  http://example.com/x  ")).toBe("http://example.com/x");
    expect(safeHref("/privacy")).toBe("/privacy");
    expect(safeHref("/")).toBe("/");
  });

  it("rejects anything else", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("mailto:a@b.c")).toBeNull();
    expect(safeHref("https://")).toBeNull();
  });
});

describe("markdownToText", () => {
  it("flattens markup and whitespace for the admin list preview", () => {
    expect(markdownToText("**New** dishes\nare up\n\nGo [see](/).")).toBe("New dishes are up Go see.");
  });
});
