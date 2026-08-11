import { describe, expect, it } from "vitest";
import { avatarUrl, displayName } from "./avatar";

// A real-shaped snowflake: 64 bits, comfortably past what a double holds exactly.
const ID = "175928847299117063";

describe("avatarUrl", () => {
  it("points at the user's own picture", () => {
    expect(avatarUrl(ID, "a1b2c3d4e5f6")).toBe(`https://cdn.discordapp.com/avatars/${ID}/a1b2c3d4e5f6.png?size=64`);
  });

  // An `a_` hash is animated; asking for .png returns a still frame, which only
  // breaks for Nitro users and so is exactly the kind of bug that ships.
  it("asks for a gif when the avatar is animated", () => {
    expect(avatarUrl(ID, "a_1b2c3d4e5f6")).toBe(`https://cdn.discordapp.com/avatars/${ID}/a_1b2c3d4e5f6.gif?size=64`);
  });

  it("falls back to a stock face when there's no avatar", () => {
    for (const hash of [null, undefined, ""]) {
      expect(avatarUrl(ID, hash)).toMatch(/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
    }
  });

  // The shift has to be BigInt: in Number arithmetic a snowflake rounds and
  // everybody collapses onto the same face.
  it("indexes the stock face off the whole snowflake", () => {
    const index = (id: string) => Number((BigInt(id) >> 22n) % 6n);
    for (const id of [ID, "80351110224678912", "999999999999999999", "1"]) {
      expect(avatarUrl(id, null)).toBe(`https://cdn.discordapp.com/embed/avatars/${index(id)}.png`);
    }
    // Ids that differ only below the shift share a face; ones above it don't.
    expect(avatarUrl("4194304", null)).not.toBe(avatarUrl("0", null));
  });

  it("still returns a url for an id that isn't a snowflake", () => {
    expect(avatarUrl("not-an-id", null)).toBe("https://cdn.discordapp.com/embed/avatars/0.png");
  });
});

describe("displayName", () => {
  const user = { username: "diner_fan", global_name: "Diner Fan" };

  it("prefers the name the server knows them by", () => {
    expect(displayName(user, "Chef")).toBe("Chef");
    expect(displayName(user, null)).toBe("Diner Fan");
    expect(displayName({ username: "diner_fan" }, null)).toBe("diner_fan");
  });

  it("treats blank names as absent", () => {
    expect(displayName(user, "   ")).toBe("Diner Fan");
    expect(displayName({ username: "diner_fan", global_name: "  " }, "")).toBe("diner_fan");
  });

  it("never returns an empty author line", () => {
    expect(displayName({}, null)).toBe("Someone");
    expect(displayName({ username: "" }, "")).toBe("Someone");
  });
});
