import { describe, expect, it } from "vitest";
import { derivePlayerId } from "./playerid";

describe("derivePlayerId", () => {
  it("is stable for one user and one secret", async () => {
    expect(await derivePlayerId("123456789012345678", "s1")).toBe(await derivePlayerId("123456789012345678", "s1"));
  });

  it("differs by user and by secret", async () => {
    const a = await derivePlayerId("123456789012345678", "s1");
    expect(await derivePlayerId("123456789012345679", "s1")).not.toBe(a);
    expect(await derivePlayerId("123456789012345678", "s2")).not.toBe(a);
  });

  it("is a device-id-shaped string that does not contain the Discord id", async () => {
    const id = await derivePlayerId("123456789012345678", "s1");
    expect(id).toMatch(/^d-[0-9a-f]{32}$/);
    expect(id).not.toContain("123456789012345678");
  });

  it("refuses without a secret or with something that is not a snowflake", async () => {
    expect(await derivePlayerId("123456789012345678", undefined)).toBeNull();
    expect(await derivePlayerId("123456789012345678", "")).toBeNull();
    expect(await derivePlayerId("not-an-id", "s1")).toBeNull();
    expect(await derivePlayerId(undefined, "s1")).toBeNull();
  });
});
