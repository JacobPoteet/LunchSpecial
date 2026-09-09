import { describe, expect, it } from "vitest";
import { carryDemo, DEMO_PATH, demoEntrance, demoSessionNeeded, type DemoEntrance } from "./demo";

const search = (qs: string) => new URLSearchParams(qs);

describe("demoEntrance", () => {
  it("reads the public route off the path", () => {
    expect(demoEntrance(DEMO_PATH, search(""))).toBe("route");
    expect(demoEntrance("/demo/", search(""))).toBe("route");
  });

  it("reads the showcase link off ?s=", () => {
    expect(demoEntrance("/", search("s=abc"))).toBe("link");
  });

  it("is none on an ordinary board", () => {
    expect(demoEntrance("/", search(""))).toBe("none");
    expect(demoEntrance("/", search("date=2026-08-01"))).toBe("none");
    // A dish preview is an admin's rehearsal, not a demo. It has its own banner,
    // its own lifetime and its own dressing, and folding the two together is the
    // carve-out worker/showcase.ts already declined to make.
    expect(demoEntrance("/", search("preview=tok"))).toBe("none");
  });

  it("does not mistake a path that merely starts with /demo", () => {
    expect(demoEntrance("/demonstration", search(""))).toBe("none");
  });

  it("lets the route outrank a token, since the path is what survives a hop", () => {
    expect(demoEntrance(DEMO_PATH, search("s=abc"))).toBe("route");
  });
});

describe("carryDemo", () => {
  it("leaves an ordinary navigation alone", () => {
    expect(carryDemo("/?date=2026-08-01", "none", "abc")).toBe("/?date=2026-08-01");
  });

  it("rewrites the diner's root onto the demo route", () => {
    expect(carryDemo("/", "route")).toBe(DEMO_PATH);
    expect(carryDemo("/?random", "route")).toBe(`${DEMO_PATH}?random=`);
  });

  it("carries the archive and Chef's Choice hops that used to drop the demo", () => {
    // The regression this whole module exists for: both of these used to land a
    // demo visitor on a tracked round that wrote to localStorage.
    expect(carryDemo("/?date=2026-08-01", "route")).toBe(`${DEMO_PATH}?date=2026-08-01`);
    expect(carryDemo("/?date=2026-08-01", "link", "abc")).toBe("/?date=2026-08-01&s=abc");
  });

  it("re-attaches the showcase token", () => {
    expect(carryDemo("/", "link", "abc")).toBe("/?s=abc");
  });

  it("needs a token to carry a link, and says so by carrying nothing", () => {
    expect(carryDemo("/", "link")).toBe("/");
  });

  it("lets the caller override a param already on the target", () => {
    expect(carryDemo("/?s=explicit", "link", "abc")).toBe("/?s=explicit");
  });

  it("leaves a named page alone rather than demo-flavouring it", () => {
    expect(carryDemo("/press.html", "route")).toBe("/press.html");
  });

  it("composes with the dev flags and Discord's params without eating either", () => {
    // devUrl runs first and hands this a query string; surfaceUrl runs after.
    expect(carryDemo("/?barhours=off", "route")).toBe(`${DEMO_PATH}?barhours=off`);
    expect(carryDemo("/?barhours=off", "link", "abc")).toBe("/?barhours=off&s=abc");
  });

  it("is idempotent, so a hop through two wrappers cannot double up", () => {
    const entrances: DemoEntrance[] = ["none", "route", "link"];
    for (const e of entrances) {
      const once = carryDemo("/", e, "abc");
      expect(carryDemo(once, e, "abc")).toBe(once);
    }
  });
});

describe("demoSessionNeeded", () => {
  it("mints one for a stranger with no session", () => {
    expect(demoSessionNeeded(true, null)).toBe(true);
  });

  it("REPLACES a full session, so the owner sees what a visitor sees", () => {
    // The regression this exists for. Keeping the full session here meant the
    // one person who ever checks the demo was the one person who never saw it:
    // the back office rendered at full privilege, every write button live.
    expect(demoSessionNeeded(true, "full")).toBe(true);
  });

  it("does not re-mint when the session is already read-only", () => {
    expect(demoSessionNeeded(true, "readonly")).toBe(false);
  });

  it("leaves an ordinary /admin visit alone", () => {
    expect(demoSessionNeeded(false, null)).toBe(false);
    expect(demoSessionNeeded(false, "full")).toBe(false);
    expect(demoSessionNeeded(false, "readonly")).toBe(false);
  });
});
