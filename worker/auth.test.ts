import { describe, expect, it } from "vitest";
import { createToken, verifyToken } from "./auth";

const SECRET = "test-secret-not-a-real-one";
const HOUR = 3_600_000;

describe("createToken / verifyToken", () => {
  it("round-trips a payload", async () => {
    const token = await createToken("sc", HOUR, SECRET);
    expect(await verifyToken(token, SECRET)).toBe("sc");
  });

  it("round-trips a payload containing dots", async () => {
    // verifyToken splits on the LAST two dots, so a payload with its own is
    // fine. Worth pinning: the expiry encoding sits between them.
    const token = await createToken("preview:drink:42", HOUR, SECRET);
    expect(await verifyToken(token, SECRET)).toBe("preview:drink:42");
  });

  it("refuses a token signed with another secret", async () => {
    const token = await createToken("sc", HOUR, SECRET);
    expect(await verifyToken(token, "a-different-secret")).toBeNull();
  });

  it("refuses a token whose payload was edited", async () => {
    const token = await createToken("preview:drink:42", HOUR, SECRET);
    expect(await verifyToken(token.replace("42", "43"), SECRET)).toBeNull();
  });

  it("refuses a token whose expiry was pushed out", async () => {
    // The expiry is inside the signed data, so extending it breaks the
    // signature. This is the whole reason the token can be stateless.
    const token = await createToken("sc", HOUR, SECRET);
    const [payload, , sig] = token.split(".");
    const forged = `${payload}.${(Math.ceil(Date.now() / 1000) + 999_999).toString(36)}.${sig}`;
    expect(await verifyToken(forged, SECRET)).toBeNull();
  });

  it("refuses an expired token", async () => {
    const token = await createToken("sc", -1000, SECRET);
    expect(await verifyToken(token, SECRET)).toBeNull();
  });

  it("refuses junk", async () => {
    expect(await verifyToken("", SECRET)).toBeNull();
    expect(await verifyToken("nodots", SECRET)).toBeNull();
    expect(await verifyToken("a.b", SECRET)).toBeNull();
  });
});

describe("token size", () => {
  it("signs with 128 bits, which is 22 base64url characters", async () => {
    const token = await createToken("sc", HOUR, SECRET);
    expect(token.split(".").pop()).toHaveLength(22);
  });

  it("encodes the expiry as base36 seconds", async () => {
    const token = await createToken("sc", HOUR, SECRET);
    const encoded = token.split(".")[1];
    expect(encoded).toMatch(/^[0-9a-z]+$/);
    // Six characters until base36 rolls over in 2038, and never 13 again.
    expect(encoded.length).toBeLessThanOrEqual(7);
    expect(parseInt(encoded, 36) * 1000).toBeGreaterThan(Date.now());
  });

  it("rounds the expiry up, so a token never dies early", async () => {
    const before = Date.now() + HOUR;
    const token = await createToken("sc", HOUR, SECRET);
    expect(parseInt(token.split(".")[1], 36) * 1000).toBeGreaterThanOrEqual(before);
  });

  it("keeps a showcase link short enough to paste into an email", async () => {
    // The showcase payload is the one token a person actually reads. Guard the
    // whole URL rather than the token: the param name is part of the length.
    const token = await createToken("sc", 30 * 24 * HOUR, SECRET);
    const url = `https://lunchspecial.app/?s=${encodeURIComponent(token)}`;
    expect(url.length).toBeLessThan(65);
    expect(token).not.toContain(":"); // no %3A in the URL
  });
});

describe("rejects a token in the previous format", () => {
  it("does not accept a full-length signature or a decimal-millisecond expiry", async () => {
    // Both compressions invalidate every token issued before them. That is a
    // deliberate one-time cost (one admin logout, dead preview links) and this
    // pins it rather than leaving it to be discovered.
    const legacy = "sc.1789495442515.GgpwRhKgCT8O4KxoSYCTTSy7FtnJQH4DhohJAATM4Ts";
    expect(await verifyToken(legacy, SECRET)).toBeNull();
  });
});
