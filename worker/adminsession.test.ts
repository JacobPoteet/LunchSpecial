import { describe, expect, it } from "vitest";
import {
  adminSubPath,
  mayCall,
  mayRead,
  mayShowClues,
  READONLY_PAYLOAD,
  SESSION_PAYLOAD,
  sessionRole,
  WITHHELD_READS,
} from "./adminsession";

describe("sessionRole", () => {
  it("reads the two payloads it issues", () => {
    expect(sessionRole(SESSION_PAYLOAD)).toBe("full");
    expect(sessionRole(READONLY_PAYLOAD)).toBe("readonly");
  });

  it("grants nothing on a missing or unrecognised payload", () => {
    expect(sessionRole(null)).toBeNull();
    expect(sessionRole("")).toBeNull();
    expect(sessionRole("preview:12")).toBeNull();
    expect(sessionRole("sc")).toBeNull();
  });

  it("matches exactly, so a read-only payload can never be read as a full one", () => {
    // The one that matters: READONLY_PAYLOAD begins with SESSION_PAYLOAD, so a
    // prefix check here would upgrade every demo visitor to a full session.
    expect(READONLY_PAYLOAD.startsWith(SESSION_PAYLOAD)).toBe(true);
    expect(sessionRole(READONLY_PAYLOAD)).not.toBe("full");
    expect(sessionRole(`${SESSION_PAYLOAD}:anything`)).toBeNull();
    expect(sessionRole(`${READONLY_PAYLOAD}x`)).toBeNull();
  });
});

describe("mayCall", () => {
  it("lets a full session do anything", () => {
    for (const m of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
      expect(mayCall("full", m)).toBe(true);
    }
  });

  it("lets a read-only session read", () => {
    expect(mayCall("readonly", "GET")).toBe(true);
    expect(mayCall("readonly", "HEAD")).toBe(true);
    expect(mayCall("readonly", "get")).toBe(true);
  });

  it("refuses every write, including ones no route serves yet", () => {
    for (const m of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS", ""]) {
      expect(mayCall("readonly", m), `readonly should not be able to ${m}`).toBe(false);
    }
  });
});

describe("adminSubPath", () => {
  it("reduces a full request path to the router's own", () => {
    expect(adminSubPath("/api/admin/dishes/12")).toBe("/dishes/12");
    expect(adminSubPath("/api/admin/schedule")).toBe("/schedule");
  });

  it("normalises trailing slashes, which would otherwise dodge the gate", () => {
    expect(adminSubPath("/api/admin/schedule/")).toBe("/schedule");
    expect(adminSubPath("/api/admin/schedule///")).toBe("/schedule");
    expect(adminSubPath("/api/admin")).toBe("/");
    expect(adminSubPath("/api/admin/")).toBe("/");
  });

  it("passes through a path that is already reduced", () => {
    expect(adminSubPath("/dishes")).toBe("/dishes");
  });
});

describe("mayRead", () => {
  it("lets a full session read anything", () => {
    for (const w of WITHHELD_READS) expect(mayRead("full", w)).toBe(true);
  });

  it("refuses the spoilers", () => {
    // The forward schedule and the bar's nightly board name Specials nobody has
    // played yet, which the public game refuses to serve at all.
    expect(mayRead("readonly", "/schedule")).toBe(false);
    expect(mayRead("readonly", "/nights")).toBe(false);
    expect(mayRead("readonly", "/drinks")).toBe(false);
    expect(mayRead("readonly", "/drinks/12")).toBe(false);
  });

  it("refuses other people's words and the raw per-device feed", () => {
    expect(mayRead("readonly", "/requests")).toBe(false);
    expect(mayRead("readonly", "/announcements")).toBe(false);
    expect(mayRead("readonly", "/experiments")).toBe(false);
    expect(mayRead("readonly", "/recent-rounds")).toBe(false);
    expect(mayRead("readonly", "/device-data")).toBe(false);
  });

  it("still serves every aggregate the demo exists to show", () => {
    for (const p of [
      "/dashboard",
      "/analytics",
      "/menu-mix",
      "/dish-report",
      "/night-report",
      "/dishes",
      "/dishes/28",
      "/ingredients",
      "/session",
    ]) {
      expect(mayRead("readonly", p), `${p} should stay readable`).toBe(true);
    }
  });

  it("matches whole segments, so the report routes survive their neighbours", () => {
    // `/dish-report` next to `/dishes`, and `/night-report` next to `/nights`.
    // A bare startsWith would take both, and both are aggregates the demo wants.
    expect(mayRead("readonly", "/dish-report")).toBe(true);
    expect(mayRead("readonly", "/night-report")).toBe(true);
    // `/drink-ingredients` is withheld on its own line, not by prefix.
    expect(mayRead("readonly", "/drink-ingredients")).toBe(false);
  });

  it("gates on the full path too, since that is what the middleware holds", () => {
    expect(mayRead("readonly", "/api/admin/schedule")).toBe(false);
    expect(mayRead("readonly", "/api/admin/dashboard")).toBe(true);
  });
});

describe("mayShowClues", () => {
  it("shows a served dish's clues, which the game already revealed", () => {
    expect(mayShowClues("readonly", "2026-08-01")).toBe(true);
  });

  it("withholds an unserved dish's, because that is a future Special", () => {
    expect(mayShowClues("readonly", null)).toBe(false);
  });

  it("never withholds from a full session", () => {
    expect(mayShowClues("full", null)).toBe(true);
  });
});
