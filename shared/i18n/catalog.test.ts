/// <reference types="node" />
// Every catalog against English. tsc already fails on a missing key; this
// catches what types can't: a message that changed from string to function (or
// gained an argument) in English and not elsewhere, a locale file nobody
// listed, and a value left in English by a translation pass.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES, PSEUDO_LOCALE } from "../locale";
import { CATALOGS } from "./catalogs";
import en from "./locales/en";
import { pseudoize } from "./pseudo";

const DIR = join(__dirname, "locales");
const TAGS = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => f.replace(/\.ts$/, ""));

/**
 * Keys a translation may leave identical to English: brand words and names
 * the glossary keeps (the logo, After Dark). Add the key path, not the value.
 */
const MAY_MATCH_ENGLISH = new Set<string>([
  // The marquee is English in every language.
  "presence.modes.nightcap",
  // The same word in Spanish (and most languages that borrow it).
  "spirits.tequila",
  "spirits.vodka",
  "occasions.halloween.name",
]);

/** Every leaf as "path:kind", functions with their arity. */
function shape(value: unknown, path = ""): string[] {
  if (typeof value === "string") return [`${path}:string`];
  if (typeof value === "function") return [`${path}:fn/${value.length}`];
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  }
  return [`${path}:${typeof value}`];
}

/** Every string leaf, by path. */
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

const load = async (tag: string): Promise<unknown> => (await import(`./locales/${tag}.ts`)).default;

describe("the catalogs", () => {
  it("are exactly the shipped locales, one file each", () => {
    expect([...TAGS].sort()).toEqual(LOCALES.map((l) => l.tag).sort());
  });

  it("are all in CATALOGS, with the pseudo-locale", () => {
    expect(Object.keys(CATALOGS).sort()).toEqual([...LOCALES.map((l) => l.tag), PSEUDO_LOCALE].sort());
  });

  it("have English's keys, kinds and arities", async () => {
    const want = shape(en).sort();
    for (const tag of TAGS) expect([tag, shape(await load(tag)).sort()]).toEqual([tag, want]);
    expect(shape(pseudoize(en)).sort()).toEqual(want);
  });

  it("leave nothing in English that the glossary doesn't keep", async () => {
    const english = new Map(strings(en));
    const leftovers: string[] = [];
    for (const tag of TAGS.filter((t) => t !== "en")) {
      for (const [path, value] of strings(await load(tag))) {
        if (value === english.get(path) && !MAY_MATCH_ENGLISH.has(path)) leftovers.push(`${tag}: ${path}`);
      }
    }
    expect(leftovers).toEqual([]);
  });
});

describe("the pseudo-locale", () => {
  it("marks every string, so an unmarked one on screen is a leak", () => {
    for (const [path, value] of strings(pseudoize(en))) {
      expect([path, value.startsWith("[") && value.endsWith("]")]).toEqual([path, true]);
    }
  });
});
