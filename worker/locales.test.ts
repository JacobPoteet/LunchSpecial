import { describe, expect, it } from "vitest";
import { foldLocales } from "./locales";

describe("foldLocales", () => {
  it("is empty, with everything untracked, before the column existed", () => {
    expect(foldLocales([{ locale: null, player_id: "a", n: 7 }])).toEqual({
      entries: [],
      rounds: 0,
      players: 0,
      untracked: 7,
    });
  });

  it("counts rounds exactly and each device once, in the language it played most", () => {
    const mix = foldLocales([
      { locale: "en", player_id: "a", n: 3 },
      { locale: "es", player_id: "a", n: 1 },
      { locale: "es", player_id: "b", n: 2 },
      { locale: "en", player_id: null, n: 1 },
    ]);
    expect(mix.entries).toEqual([
      { locale: "en", rounds: 4, players: 1 },
      { locale: "es", rounds: 3, players: 1 },
    ]);
    expect(mix.players).toBe(2);
    expect(mix.rounds).toBe(7);
  });

  it("never reads NULL or a malformed tag as English", () => {
    const mix = foldLocales([
      { locale: null, player_id: "a", n: 5 },
      { locale: "not a tag", player_id: "a", n: 1 },
      { locale: "es", player_id: "a", n: 1 },
    ]);
    expect(mix.entries).toEqual([{ locale: "es", rounds: 1, players: 1 }]);
    expect(mix.untracked).toBe(6);
  });

  it("breaks a device's tie by tag, not by row order", () => {
    const one = foldLocales([
      { locale: "es", player_id: "a", n: 1 },
      { locale: "en", player_id: "a", n: 1 },
    ]);
    const two = foldLocales([
      { locale: "en", player_id: "a", n: 1 },
      { locale: "es", player_id: "a", n: 1 },
    ]);
    expect(one).toEqual(two);
    expect(one.entries.find((e) => e.players === 1)?.locale).toBe("en");
  });
});
