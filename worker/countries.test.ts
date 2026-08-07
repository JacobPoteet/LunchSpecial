import { describe, expect, it } from "vitest";
import { foldCountries, type CountryRow } from "./countries";

const row = (country: string | null, player: string | null, n = 1): CountryRow => ({
  country,
  player_id: player,
  n,
});

/** The pie's slices, in the order they'd be drawn. */
const slices = (mix: ReturnType<typeof foldCountries>) =>
  mix.entries.map((e) => [e.code, e.players, e.rounds]);

describe("foldCountries", () => {
  it("returns an empty mix with no rows", () => {
    expect(foldCountries([])).toEqual({ entries: [], rounds: 0, players: 0, untracked: 0 });
  });

  it("counts rounds and devices per country", () => {
    const mix = foldCountries([
      row("US", "a", 4),
      row("US", "b", 1),
      row("CA", "c", 2),
    ]);
    expect(slices(mix)).toEqual([
      ["US", 2, 5],
      ["CA", 1, 2],
    ]);
    expect(mix).toMatchObject({ rounds: 7, players: 3, untracked: 0 });
  });

  it("holds untracked rounds out of the distribution instead of inventing a slice", () => {
    const mix = foldCountries([row(null, "a", 12), row("US", "b", 3)]);
    expect(slices(mix)).toEqual([["US", 1, 3]]);
    // 12 pre-tracking rounds must not be a country, and must not inflate the US
    // share by quietly vanishing either.
    expect(mix.untracked).toBe(12);
    expect(mix.rounds).toBe(3);
    expect(mix.players).toBe(1);
  });

  it("puts a device that played from two countries in exactly one", () => {
    const mix = foldCountries([row("US", "traveller", 9), row("FR", "traveller", 2), row("FR", "local", 1)]);
    // Rounds split honestly across both; the device itself counts once, at home.
    expect(slices(mix)).toEqual([
      ["US", 1, 9],
      ["FR", 1, 3],
    ]);
    // The whole audience is two devices — the slices must not sum to three.
    expect(mix.players).toBe(2);
    expect(mix.entries.reduce((n, e) => n + e.players, 0)).toBe(mix.players);
  });

  it("breaks a tied device by code so the fold doesn't depend on row order", () => {
    const forward = foldCountries([row("US", "a", 3), row("DE", "a", 3)]);
    const reversed = foldCountries([row("DE", "a", 3), row("US", "a", 3)]);
    expect(slices(forward)).toEqual(slices(reversed));
    expect(forward.entries.find((e) => e.code === "DE")?.players).toBe(1);
    expect(forward.entries.find((e) => e.code === "US")?.players).toBe(0);
  });

  it("counts rounds from clients with no device id, but no player", () => {
    const mix = foldCountries([row("GB", null, 5)]);
    expect(slices(mix)).toEqual([["GB", 0, 5]]);
    expect(mix).toMatchObject({ rounds: 5, players: 0 });
  });

  it("keeps Cloudflare's non-country answers as their own slices", () => {
    const mix = foldCountries([row("T1", "tor", 2), row("XX", "unknown", 1)]);
    expect(slices(mix)).toEqual([
      ["T1", 1, 2],
      ["XX", 1, 1],
    ]);
  });

  it("normalises casing and treats junk codes as untracked", () => {
    const mix = foldCountries([row("us", "a", 2), row("USA", "b", 4), row("", "c", 1)]);
    expect(slices(mix)).toEqual([["US", 1, 2]]);
    expect(mix.untracked).toBe(5);
  });

  it("ranks by devices, not by the busiest device", () => {
    const mix = foldCountries([
      row("JP", "heavy", 40),
      ...["p1", "p2", "p3"].map((p) => row("MX", p, 1)),
    ]);
    expect(mix.entries.map((e) => e.code)).toEqual(["MX", "JP"]);
  });
});
