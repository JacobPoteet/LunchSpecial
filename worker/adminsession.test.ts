import { describe, expect, it } from "vitest";
import { mayCall, READONLY_PAYLOAD, SESSION_PAYLOAD, sessionRole } from "./adminsession";

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
