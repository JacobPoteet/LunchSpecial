import { describe, expect, it } from "vitest";
import { SITE_ORIGIN, siteUrl, staysInTheGame } from "./links";

describe("staysInTheGame", () => {
  it("keeps the board's own routes in place", () => {
    expect(staysInTheGame("/")).toBe(true);
    expect(staysInTheGame("/play")).toBe(true);
    expect(staysInTheGame(`${SITE_ORIGIN}/`)).toBe(true);
  });

  // An archive deep link is the same document with a different query.
  it("ignores query and hash", () => {
    expect(staysInTheGame("/?date=2026-07-20")).toBe(true);
    expect(staysInTheGame("/play?special=ramen")).toBe(true);
    expect(staysInTheGame("/#top")).toBe(true);
  });

  // These are separate static documents: following one unloads the React app,
  // which inside an Activity means unloading the Activity.
  it("treats the side pages as leaving", () => {
    expect(staysInTheGame("/privacy")).toBe(false);
    expect(staysInTheGame("/terms")).toBe(false);
    expect(staysInTheGame("/press")).toBe(false);
    expect(staysInTheGame(`${SITE_ORIGIN}/privacy`)).toBe(false);
  });

  it("treats anywhere off the site as leaving", () => {
    expect(staysInTheGame("https://discord.com")).toBe(false);
    expect(staysInTheGame("https://lunchspecial.app.evil.test/")).toBe(false);
    expect(staysInTheGame("mailto:hello@lunchspecial.app")).toBe(false);
  });

  // Nothing here throws; the safe answer for an address we can't read is that
  // it leaves, which at worst opens a browser tab instead of navigating.
  it("calls an unreadable href a departure", () => {
    expect(staysInTheGame("")).toBe(true); // resolves to the front door
    expect(staysInTheGame("http://")).toBe(false);
  });
});

describe("siteUrl", () => {
  // Resolved against the public origin, never the current page: inside Discord
  // the page's origin is the proxy, which is the one address we must not send a
  // player's browser to.
  it("makes a path absolute against the public origin", () => {
    expect(siteUrl("/privacy")).toBe(`${SITE_ORIGIN}/privacy`);
    expect(siteUrl("/?date=2026-07-20")).toBe(`${SITE_ORIGIN}/?date=2026-07-20`);
  });

  it("leaves an absolute url alone", () => {
    expect(siteUrl("https://discord.com/")).toBe("https://discord.com/");
    expect(siteUrl("mailto:hello@lunchspecial.app")).toBe("mailto:hello@lunchspecial.app");
  });

  it("falls back to the front door rather than throwing", () => {
    expect(siteUrl("http://")).toBe(SITE_ORIGIN);
  });
});
