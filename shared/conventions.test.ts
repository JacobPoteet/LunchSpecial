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

describe("folds in shared/ take their messages as an argument", () => {
  // Same rule as BuildInfo: a fold that imports English speaks English to
  // every caller, and its test can't hand it another catalog. Type imports are
  // fine; the catalogs themselves live under shared/i18n/.
  it("nothing outside shared/i18n/ imports a locale's values", () => {
    const offenders = sourceFiles(join(ROOT, "shared"))
      .filter((file) => !rel(file).startsWith("shared/i18n/"))
      .filter((file) =>
        /^import\s+(?!type\b)[^;]*from\s+["'][^"']*\/(locales\/[^"']*|i18n\/catalogs)["']/m.test(read(file)),
      )
      .map(rel);
    expect(offenders).toEqual([]);
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

describe("the stylesheets spend the spacing scale through tokens", () => {
  // base.css names the scale (--space-N). A raw 12px in a padding, margin or gap
  // is how the rules drifted to 27 values a pixel apart. Values off the scale
  // (1, 3, 19, 26, 60) stay literal; negatives and calc() are skipped.
  const ON_SCALE = new Set([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 34, 40, 48]);
  const SNAPPED = new Set([5, 7, 9, 11, 13]);

  it("padding, margin and gap use --space-N on the scale", () => {
    const offenders: string[] = [];
    for (const file of ["src/styles/game.css", "src/styles/admin.css"]) {
      const css = readFileSync(join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const [, prop, value] of css.matchAll(/(?:^|[;{}\s])((?:padding|margin|gap|row-gap|column-gap)[a-z-]*)\s*:\s*([^;{}]+);/g)) {
        if (value.includes("calc(")) continue;
        for (const px of value.matchAll(/(?<![\w.-])(\d+)px/g)) {
          const n = Number(px[1]);
          if (ON_SCALE.has(n) || SNAPPED.has(n)) offenders.push(`${file}: ${prop}: ${value.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the stylesheets spend colour channels and border widths through tokens", () => {
  // base.css names the channels (--teal-rgb...) and the widths (--border-*).
  const CHANNELS = ["255, 95, 122", "124, 200, 255", "232, 165, 58", "27, 79, 74", "43, 35, 32", "20, 17, 16", "10, 20, 18"];

  it("no rgba() of a named channel, and no raw 1/1.5/2/3px border width", () => {
    const offenders: string[] = [];
    for (const file of ["src/styles/game.css", "src/styles/admin.css"]) {
      const css = readFileSync(join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const [, c] of css.matchAll(/rgba\(\s*(\d+\s*,\s*\d+\s*,\s*\d+)\s*,/g)) {
        if (CHANNELS.includes(c.replace(/\s+/g, " ").replace(/,(?=\S)/g, ", "))) offenders.push(`${file}: rgba(${c}`);
      }
      for (const [, prop, value] of css.matchAll(/(?:^|[;{}\s])(border(?:-top|-bottom|-left|-right)?|border-width)\s*:\s*([^;{}]+);/g)) {
        if (/(?<![\w.-])(1|1\.5|2|3)px(?![\w.])/.test(value)) offenders.push(`${file}: ${prop}: ${value.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the game's screens speak through the catalog", () => {
  // Every word a player reads comes from shared/i18n/locales/en.ts, or a
  // second language leaks English. oxlint has no i18n rule, so this walks the
  // TSX with the parser Vite already ships. It sees JSX text and the props that
  // carry words; strings built in code are left to review and the pseudo-locale.
  const WORD_PROPS = new Set(["aria-label", "title", "placeholder", "alt", "label", "text"]);
  // The brand stays English in every language: the neon sign and the bar's name.
  const BRAND = new Set(["Lunch Special", "After Dark"]);

  it("no raw text in src/game or src/occasions JSX", async () => {
    const { parseSync } = await import("vite");
    const offenders: string[] = [];
    const tsx = [...sourceFiles(join(ROOT, "src", "game")), ...sourceFiles(join(ROOT, "src", "occasions"))].filter((f) =>
      f.endsWith(".tsx"),
    );
    for (const file of tsx) {
      const code = readFileSync(file, "utf8");
      const flag = (text: string, at: number) => {
        // `&nbsp;` and friends are spacing, not words.
        const words = text.replace(/&[a-z]+;/gi, " ").trim().replace(/\s+/g, " ");
        if (/\p{L}{2,}/u.test(words) && !BRAND.has(words)) {
          offenders.push(`${rel(file)}:${code.slice(0, at).split("\n").length}: ${words}`);
        }
      };
      const walk = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach(walk);
        const n = node as { type?: string; value?: unknown; name?: { name?: unknown }; start: number };
        if (n.type === "JSXText" && typeof n.value === "string") flag(n.value, n.start);
        if (n.type === "JSXAttribute" && WORD_PROPS.has(String(n.name?.name))) {
          const v = n.value as { type?: string; value?: unknown } | null;
          if (v?.type === "Literal" && typeof v.value === "string") flag(v.value, n.start);
        }
        if (n.type === "JSXExpressionContainer") {
          const e = (n as { expression?: { type?: string; value?: unknown } }).expression;
          if (e?.type === "Literal" && typeof e.value === "string") flag(e.value, n.start);
        }
        for (const [key, child] of Object.entries(n)) if (key !== "parent") walk(child);
      };
      walk(parseSync(file, code).program);
    }
    expect(tsx.length).toBeGreaterThan(10); // the scan must see the files it polices
    expect(offenders).toEqual([]);
  });
});
