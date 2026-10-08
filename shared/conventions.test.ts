/// <reference types="node" />
// Source-scanning checks for conventions that used to live only as prose in
// CLAUDE.md. Each one guards something that fails quietly: a blocked beacon, a
// build global that vitest never defines, a script that stops running under
// plain node.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

/** Comments name the banned words on purpose, so scan code only. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const read = (path: string) => stripComments(readFileSync(path, "utf8"));
const rel = (path: string) => relative(ROOT, path).replace(/\\/g, "/");

describe("client-called URLs stay out of ad blockers' patterns", () => {
  // Ad blockers match these by pattern; a blocked fire-and-forget beacon looks
  // exactly like a delivered one, so the players simply never get counted.
  const BANNED = /analytics|event|track|collect|beacon|telemetry|pixel|visit|view|pageview/i;

  it("no public /api/ path a browser calls contains a banned word", () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const file of sourceFiles(join(ROOT, "src")).filter((f) => !rel(f).startsWith("src/admin/"))) {
      for (const match of read(file).matchAll(/["'`](\/api\/[^"'`$?]*)/g)) {
        scanned++;
        if (BANNED.test(match[1])) offenders.push(`${rel(file)}: ${match[1]}`);
      }
    }
    expect(scanned).toBeGreaterThan(10); // the scan must see the paths it polices
    expect(offenders).toEqual([]);
  });

  it("no admin path the dashboard calls is the old /events feed", () => {
    // /analytics is the dashboard's own read and has always loaded; /events is
    // the one that failed with a bare NetworkError.
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src", "admin"))) {
      for (const match of read(file).matchAll(/["'`](\/[a-z-]*events[a-z-]*)/g)) {
        offenders.push(`${rel(file)}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("__BUILD__ is read in one place", () => {
  // `define` injects it for the app project only. vitest never runs `define`,
  // so a fold that reaches for it is untestable, and in worker/ it is simply
  // undeclared.
  it("is never referenced from worker/ or shared/", () => {
    const offenders = [...sourceFiles(join(ROOT, "worker")), ...sourceFiles(join(ROOT, "shared"))]
      .filter((file) => read(file).includes("__BUILD__"))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("modules the docs script runs under plain node", () => {
  // scripts/build-ingredient-web.mjs strips types but resolves no extensionless
  // import, so any value import breaks `npm run docs:web`.
  it.each(["shared/families.ts", "shared/pack.ts"])("%s imports types only", (file) => {
    const imports = [...read(join(ROOT, file)).matchAll(/^import\s+(?!type\b)[^;]*;/gm)].map((m) => m[0]);
    expect(imports).toEqual([]);
  });
});

describe("the wiki's location stays out of the repo", () => {
  // The path lives in a gitignored file, so this only runs where that file
  // exists (a maintainer's machine). CI skips it, which is fine: the leak it
  // catches is made locally, before the PR.
  const pathFile = join(ROOT, ".claude", "wiki-path.local");
  const wikiPath = existsSync(pathFile)
    ? readFileSync(pathFile, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .pop()
    : undefined;

  it.skipIf(!wikiPath)("no tracked file mentions it", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
    const offenders = tracked.filter((file) => {
      try {
        return readFileSync(join(ROOT, file), "utf8").includes(wikiPath!);
      } catch {
        return false; // deleted in the working tree, or not text
      }
    });
    expect(offenders).toEqual([]);
  });
});
