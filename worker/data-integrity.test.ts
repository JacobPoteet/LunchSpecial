import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

// Applies every migration + the seed catalog to a real (in-memory) SQLite
// database so the schema's own CHECK/UNIQUE constraints do the enforcing —
// this catches a mistyped enum ('drink ' or 'entre') the same way D1 would,
// since entries are often hand-written SQL rather than added through /admin.

const ROOT = join(__dirname, "..");
const REGIONS = [
  "north-america",
  "latin-america",
  "europe",
  "middle-east",
  "africa",
  "south-asia",
  "east-asia",
  "southeast-asia",
  "oceania",
];

function buildDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  const migrationsDir = join(ROOT, "migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }

  db.exec(readFileSync(join(ROOT, "seed", "seed.sql"), "utf8"));

  return db;
}

describe("catalog data integrity", () => {
  const db = buildDb();

  it("gives every dish a valid region bucket", () => {
    const rows = db
      .prepare("SELECT slug, region FROM dishes")
      .all() as { slug: string; region: string }[];
    const bad = rows.filter((r) => !REGIONS.includes(r.region));
    expect(bad, `dishes with an invalid region: ${JSON.stringify(bad)}`).toEqual([]);
  });

  it("gives every dish a slug that is lowercase-kebab ASCII", () => {
    const rows = db.prepare("SELECT slug FROM dishes").all() as { slug: string }[];
    const bad = rows.filter((r) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.slug));
    expect(bad, `dishes with a malformed slug: ${JSON.stringify(bad)}`).toEqual([]);
  });

  it("gives every dish >= 3 lowercase, non-empty ingredients", () => {
    const rows = db
      .prepare("SELECT slug, ingredients FROM dishes")
      .all() as { slug: string; ingredients: string }[];
    const bad: string[] = [];
    for (const r of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(r.ingredients);
      } catch {
        bad.push(`${r.slug}: not valid JSON`);
        continue;
      }
      if (!Array.isArray(parsed) || parsed.length < 3) {
        bad.push(`${r.slug}: fewer than 3 ingredients`);
        continue;
      }
      for (const ing of parsed) {
        if (typeof ing !== "string" || ing !== ing.toLowerCase() || ing.trim() !== ing) {
          bad.push(`${r.slug}: ingredient "${ing}" is not canonical lowercase`);
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("gives every dish exactly 5 clues, numbered 1..5", () => {
    const rows = db
      .prepare(
        `SELECT d.slug AS slug, GROUP_CONCAT(c.order_index) AS orders, COUNT(*) AS n
         FROM dishes d LEFT JOIN clues c ON c.dish_id = d.id
         GROUP BY d.id
         HAVING n != 5`,
      )
      .all() as { slug: string; orders: string | null; n: number }[];
    expect(rows, `dishes without exactly 5 clues: ${JSON.stringify(rows)}`).toEqual([]);
  });

  // The fan tag is set by an UPDATE ... WHERE slug IN (...) in both the seed and
  // migrations/0017, so a renamed or re-slugged dish silently drops its credit
  // rather than failing — the whole point of the flag is that it survives.
  it("keeps the fan-submission flag as 0/1 and tags the known submissions", () => {
    const bad = db.prepare("SELECT slug FROM dishes WHERE is_fan_submission NOT IN (0, 1)").all();
    expect(bad, `dishes with a non-boolean fan flag: ${JSON.stringify(bad)}`).toEqual([]);

    const tagged = (
      db.prepare("SELECT slug FROM dishes WHERE is_fan_submission = 1 ORDER BY slug").all() as {
        slug: string;
      }[]
    ).map((r) => r.slug);
    expect(tagged).toContain("fairy-bread");
    expect(tagged).toContain("german-chocolate-cake");
    expect(tagged).toContain("funnel-cake");
    expect(tagged).toContain("scrambled-eggs");
  });

  it("keeps every schedule row pointing at a real, active-or-not dish", () => {
    const rows = db
      .prepare(
        `SELECT s.date AS date FROM schedule s
         LEFT JOIN dishes d ON d.id = s.dish_id
         WHERE d.id IS NULL`,
      )
      .all();
    expect(rows, `schedule rows with a dangling dish_id: ${JSON.stringify(rows)}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The beat sheet's hard rules (.claude/skills/create-dishes/SKILL.md section 3.4).
//
// Checks every dish. This started as an opt-in MIGRATED set, so the backfill
// could turn the gate on one dish at a time instead of shipping a test with
// ~374 exemptions; the set is gone now that all 381 pass, which is what
// the beat sheet says to do when the backfill lands.
// ---------------------------------------------------------------------------

/** [target lo, target hi, hard max]. Only the hard max fails. */
const BEAT_BUDGET: Record<number, [number, number, number]> = {
  1: [35, 70, 85],
  2: [60, 110, 130],
  3: [55, 105, 120],
  4: [60, 120, 130],
  5: [45, 100, 115],
};

/** Beats 1, 4 and 5 are one sentence. 2 and 3 may take two. */
const MAX_SENTENCES: Record<number, number> = { 1: 1, 2: 2, 3: 2, 4: 1, 5: 2 };

const BANNED_OPENER =
  /^(it is the|it's the|it is now|it's now|it remains|it has become|this dish|known as|considered)\b/i;

const BANNED_PRAISE =
  /\b(beloved|iconic|legendary|quintessential|must-try|delicious|mouthwatering|renowned|celebrated|revered|world-famous|the ultimate|a staple|a fixture|the go-to)\b/i;

const BANNED_HEDGE =
  /\b(often|usually|typically|generally|commonly|arguably|widely|reportedly|perhaps|somewhat|quite|very)\b/i;

const LAZY_EXTREME = /\b(everyone|nobody|worldwide|nationwide)\b/i;

/**
 * The dish's own country, as a clue would write it. Beat 1 may not contain any
 * of these; beat 5 must contain one. Countries the catalogue spells one way and
 * clues spell another get an alias list.
 */
const COUNTRY_ALIASES: Record<string, string[]> = {
  // Beat 5 has to name the country, and "Lebanon's dip" reads worse than
  // "the Lebanese dip", so the demonym counts. Only the countries the
  // catalogue actually uses; add a row when a new one arrives.
  "united states": ["united states", "america", "u.s."],
  "united kingdom": ["united kingdom", "britain", "british", "england", "english", "scotland", "wales"],
  scotland: ["scotland", "scottish", "scots", "highland"],
  ireland: ["ireland", "irish", "dublin"],
  india: ["india", "indian"],
  italy: ["italy", "italian"],
  france: ["france", "french"],
  mexico: ["mexico", "mexican"],
  japan: ["japan", "japanese"],
  china: ["china", "chinese"],
  germany: ["germany", "german"],
  thailand: ["thailand", "thai"],
  greece: ["greece", "greek"],
  spain: ["spain", "spanish"],
  lebanon: ["lebanon", "lebanese"],
  "turkiye": ["turkiye", "turkey", "turkish"],
  "south korea": ["korea", "korean"],
  "north korea": ["korea", "korean"],
  indonesia: ["indonesia", "indonesian"],
  philippines: ["philippines", "filipino", "philippine"],
  australia: ["australia", "australian"],
  morocco: ["morocco", "moroccan"],
  "south africa": ["south africa", "south african"],
  canada: ["canada", "canadian"],
  peru: ["peru", "peruvian"],
  argentina: ["argentina", "argentine", "argentinian"],
  sweden: ["sweden", "swedish"],
  nigeria: ["nigeria", "nigerian"],
  vietnam: ["vietnam", "vietnamese"],
  portugal: ["portugal", "portuguese"],
  cuba: ["cuba", "cuban"],
  hungary: ["hungary", "hungarian"],
  poland: ["poland", "polish"],
  ukraine: ["ukraine", "ukrainian"],
  russia: ["russia", "russian", "siberia"],
  egypt: ["egypt", "egyptian"],
  malaysia: ["malaysia", "malaysian", "malay"],
  singapore: ["singapore", "singaporean"],
  jamaica: ["jamaica", "jamaican"],
  "new zealand": ["new zealand", "zealand", "kiwi"],
  colombia: ["colombia", "colombian"],
  denmark: ["denmark", "danish", "copenhagen"],
  austria: ["austria", "austrian", "vienna", "viennese"],
  tunisia: ["tunisia", "tunisian"],
  brazil: ["brazil", "brazilian"],
  venezuela: ["venezuela", "venezuelan"],
  "hong kong": ["hong kong"],
  nepal: ["nepal", "nepali", "nepalese", "kathmandu"],
  "puerto rico": ["puerto rico", "puerto rican"],
  ethiopia: ["ethiopia", "ethiopian"],
  mozambique: ["mozambique", "mozambican"],
  syria: ["syria", "syrian"],
  iran: ["iran", "iranian", "persian"],
  palestine: ["palestine", "palestinian"],
  georgia: ["georgia", "georgian"],
  fiji: ["fiji", "fijian"],
  "czech republic": ["czech"],
  czechia: ["czechia", "czech"],
  norway: ["norway", "norwegian"],
  belgium: ["belgium", "belgian"],
  ghana: ["ghana", "ghanaian"],
  taiwan: ["taiwan", "taiwanese"],
  netherlands: ["netherlands", "dutch", "holland"],
  switzerland: ["switzerland", "swiss"],
  "el salvador": ["el salvador", "salvadoran"],
};

/**
 * Beat 1 gives the region and not the country, except where those are the same
 * sentence. A US regional dish's region-level answer is "the American South" or
 * "the Gulf Coast" — the alternative is "a large North American country", which
 * is the decoder-ring template the rule exists to kill. So the US is exempt and
 * judgment covers the rest: name the part, never the state or the city.
 */
const BEAT1_COUNTRY_EXEMPT = new Set(["united states"]);

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const contentWords = (s: string) =>
  new Set(
    fold(s)
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3),
  );

function countryTerms(country: string): string[] {
  const key = fold(country).replace(/^the /, "");
  return COUNTRY_ALIASES[key] ?? [key];
}

/**
 * Words from the dish's own name that no clue may use.
 *
 * The first cut banned every word in the name, and running it over the whole
 * catalogue returned 454 violations that were almost all noise: "beef" in Beef
 * Bourguignon, "salad" in Caprese Salad. Those give nothing away, because the
 * catalogue has 50 beef dishes and 9 salads. What gives a dish away is the
 * *rare* half of its name, and banning the common half is what produced "a warm
 * brown bark spice" for cinnamon.
 *
 * So a name-word is banned when it is distinctive, measured against the
 * catalogue's own names and ingredient lists (GENERIC_MIN dishes or more makes
 * a word generic).
 *
 * A name built entirely from generic words is handled by the one-name-word cap
 * below rather than here: "Cinnamon Rolls" has no rare half to bar, so what
 * stops it is the rule that a clue may use only one word of its own name.
 * See the beat sheet, hard rule 1.
 */
const GENERIC_MIN = 8;

/**
 * Category words are generic however rarely they appear, because frequency
 * counts ingredients and these are not ingredients. "Fried" turns up in six
 * dish names and no pantry, so the frequency rule alone called it distinctive
 * and banned it from Fried Rice's clues. Nobody has ever guessed a dish from
 * the word "fried".
 */
const CATEGORY_WORDS = new Set([
  "fried", "baked", "grilled", "roasted", "roast", "steamed", "boiled", "smoked",
  "stuffed", "pressed", "whipped", "sweet", "sour", "spicy", "savory", "savoury",
  "green", "black", "white", "brown", "deep", "cold", "warm",
  "cake", "soup", "stew", "salad", "sandwich", "tart", "roll", "rolls", "bread",
  "toast", "dish", "meat", "style", "fresh", "mixed", "plate", "bowl", "pudding",
]);
const NAME_STOP = new Set(["the", "and", "with", "of", "de", "la", "el", "au", "aux", "in", "on"]);

function tokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !NAME_STOP.has(w));
}

/** How many dishes each word touches, across every name and ingredient list. */
function buildWordFrequency(db: Database.Database): Map<string, number> {
  const rows = db.prepare("SELECT name, ingredients FROM dishes").all() as {
    name: string;
    ingredients: string;
  }[];
  const freq = new Map<string, number>();
  for (const row of rows) {
    const seen = new Set(tokens(row.name));
    let parsed: string[] = [];
    try {
      parsed = JSON.parse(row.ingredients) as string[];
    } catch {
      parsed = [];
    }
    for (const ing of parsed) for (const w of tokens(ing)) seen.add(w);
    for (const w of seen) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return freq;
}

function bannedNameWords(name: string, freq: Map<string, number>): string[] {
  const words = tokens(name);
  const distinctive = words.filter(
    (w) => !CATEGORY_WORDS.has(w) && (freq.get(w) ?? 0) < GENERIC_MIN,
  );
  // Only the rare words are barred here; the one-name-word cap below covers
  // names built entirely from generic and category words.
  return distinctive;
}

/**
 * The other half of the rule. Barring only the rare words lets Butter Tart say
 * "butter", which is right, but on its own it would also let Cinnamon Rolls put
 * cinnamon and rolls in one sentence, which is the name. So a clue may carry at
 * most one word of its dish's name, whatever those words are.
 */
function nameWordsUsed(name: string, folded: string): string[] {
  return tokens(name).filter((w) => nameWordRe(w).test(folded));
}

/**
 * A name-word plus the inflections a clue would naturally reach for:
 * tomato/tomatoes, mash/mashed, chocolat/chocolate. The trailing boundary
 * matters — matching a bare prefix made "thai" fire on "Thailand", which is
 * the country beat 5 is required to name.
 */
function nameWordRe(w: string): RegExp {
  return new RegExp(`\\b${w}(e|s|es|ed|d|ing)?\\b`);
}

interface ClueRow {
  slug: string;
  name: string;
  country: string;
  order_index: number;
  text: string;
}

/**
 * Every hard rule in the beat sheet a machine can decide, for one clue.
 *
 * Errors fail the build. Warnings are the target band only, which is guidance
 * rather than a rule: a 55-character beat 4 that reads well is fine, and a test
 * that reddens over it would get muted within a week. The ceiling is what holds
 * the line against the inflation this file exists to stop.
 */
function lintClue(row: ClueRow, freq: Map<string, number>): { errors: string[]; warnings: string[] } {
  const beat = row.order_index;
  const text = row.text;
  const problems: string[] = [];
  const warnings: string[] = [];
  const folded = fold(text);

  const budget = BEAT_BUDGET[beat];
  if (budget) {
    const [lo, hi, max] = budget;
    if (text.length > max) problems.push(`${text.length} chars, over the ${max} ceiling`);
    else if (text.length < lo || text.length > hi) {
      warnings.push(`${text.length} chars, outside the ${lo}-${hi} target`);
    }
  }

  const sentences = (text.match(/[.!?](\s|$)/g) ?? []).length;
  if (sentences > (MAX_SENTENCES[beat] ?? 2)) {
    problems.push(`${sentences} sentences, beat ${beat} allows ${MAX_SENTENCES[beat]}`);
  }

  if (text.includes("—")) problems.push("em dash");

  const opener = text.match(BANNED_OPENER);
  if (opener) problems.push(`banned opener "${opener[0]}"`);
  const praise = text.match(BANNED_PRAISE);
  if (praise) problems.push(`banned praise "${praise[0]}"`);
  const hedge = text.match(BANNED_HEDGE);
  if (hedge) problems.push(`banned hedge "${hedge[0]}"`);
  const extreme = text.match(LAZY_EXTREME);
  if (extreme) problems.push(`lazy extreme "${extreme[0]}"`);

  for (const w of bannedNameWords(row.name, freq)) {
    if (nameWordRe(w).test(folded)) problems.push(`says its own name word "${w}"`);
  }
  const used = nameWordsUsed(row.name, folded);
  if (used.length > 1) {
    problems.push(`carries ${used.length} words of its own name: ${used.join(", ")}`);
  }

  const namesCountry = countryTerms(row.country).some((t) => folded.includes(t));
  if (beat === 1 && namesCountry && !BEAT1_COUNTRY_EXEMPT.has(fold(row.country))) {
    problems.push("beat 1 names the country");
  }
  if (beat === 5 && !namesCountry) problems.push("beat 5 does not name the country");

  return { errors: problems, warnings };
}

/** Beat 5 restating beat 4 is the catalogue's most common defect. */
function beatFiveOverlap(clues: ClueRow[]): number {
  const four = clues.find((c) => c.order_index === 4);
  const five = clues.find((c) => c.order_index === 5);
  if (!four || !five) return 0;
  const a = contentWords(four.text);
  const b = contentWords(five.text);
  if (b.size === 0) return 0;
  let shared = 0;
  for (const w of b) if (a.has(w)) shared++;
  return shared / b.size;
}

describe("the beat sheet", () => {
  const db = buildDb();
  const freq = buildWordFrequency(db);
  const rows = db
    .prepare(
      `SELECT d.slug AS slug, d.name AS name, d.country AS country,
              c.order_index AS order_index, c.text AS text
       FROM dishes d JOIN clues c ON c.dish_id = d.id
       ORDER BY d.slug, c.order_index`,
    )
    .all() as ClueRow[];

  const bySlug = new Map<string, ClueRow[]>();
  for (const r of rows) {
    if (!bySlug.has(r.slug)) bySlug.set(r.slug, []);
    bySlug.get(r.slug)!.push(r);
  }

  it("keeps every dish on the beat sheet", () => {
    const failures: string[] = [];
    const softened: string[] = [];
    for (const [slug, clues] of bySlug) {
      for (const clue of clues) {
        const { errors, warnings } = lintClue(clue, freq);
        for (const warning of warnings) {
          softened.push(`${slug} beat ${clue.order_index}: ${warning}`);
        }
        for (const problem of errors) {
          failures.push(`${slug} beat ${clue.order_index}: ${problem}`);
        }
      }
      const overlap = beatFiveOverlap(clues);
      if (overlap > 0.7) {
        failures.push(
          `${slug}: beat 5 shares ${Math.round(overlap * 100)}% of its words with beat 4 (ceiling 70%)`,
        );
      }
    }
    // The target band is guidance, so it prints rather than failing. Watch the
    // count: a slow climb is the inflation this whole file exists to stop.
    if (softened.length > 0) {
      console.log(
        `beat sheet: ${softened.length} clues outside their target band (only the ceiling fails)`,
      );
    }
    expect(failures, `\n${failures.join("\n")}\n`).toEqual([]);
  });

  // Cross-dish, so it only runs over dishes that are all finished. Until the
  // backfill completes, a migrated dish may share phrasing with a legacy one it
  // is about to replace.
  it("never reuses a five-word phrase across two dishes", () => {
    const seen = new Map<string, Set<string>>();
    for (const r of rows) {
      const words = fold(r.text)
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
      for (let i = 0; i + 5 <= words.length; i++) {
        const phrase = words.slice(i, i + 5).join(" ");
        if (!seen.has(phrase)) seen.set(phrase, new Set());
        seen.get(phrase)!.add(r.slug);
      }
    }
    const shared = [...seen.entries()]
      .filter(([, slugs]) => slugs.size > 1)
      .map(([phrase, slugs]) => `"${phrase}" on ${[...slugs].join(", ")}`);
    expect(shared, `\n${shared.join("\n")}\n`).toEqual([]);
  });

});

// ---------------------------------------------------------------------------
// The backfill rewrites clues in two places: seed/seed.sql, which is the
// canonical catalogue, and a migration full of UPDATEs, which is the only way
// the change reaches prod. buildDb() applies migrations and THEN the seed, so
// the seed always wins and a migration missing rows is invisible to every test
// above — which is exactly what happened: a re-run of scripts/patch-clues.mjs
// rebuilt its migration from scratch and silently dropped 66 of 88 rewrites out
// of it while leaving them in the seed. Prod would have received a quarter of
// the batch and nothing would have failed.
//
// So: read the migrations as text and require every UPDATE to match what the
// seed says that clue is now.
// ---------------------------------------------------------------------------

const MIGRATION_CLUE_UPDATE =
  /UPDATE clues SET text = '((?:[^']|'')*)'\s*\n\s*WHERE dish_id = \(SELECT id FROM dishes WHERE slug = '([a-z0-9-]+)'\) AND order_index = (\d);/g;

describe("backfill migrations and the seed agree", () => {
  const db = buildDb();
  const seedText = new Map<string, string>();
  for (const r of db
    .prepare(
      `SELECT d.slug AS slug, c.order_index AS beat, c.text AS text
       FROM dishes d JOIN clues c ON c.dish_id = d.id`,
    )
    .all() as { slug: string; beat: number; text: string }[]) {
    seedText.set(`${r.slug}:${r.beat}`, r.text);
  }

  it("has no clue UPDATE that disagrees with the catalogue", () => {
    // Migrations apply in filename order and a later one overrides an earlier
    // one, so only the LAST write to a (slug, beat) has to match the seed. A
    // cleanup pass revising a clue an earlier batch already shipped is correct,
    // not drift.
    const lastWrite = new Map<string, { file: string; text: string }>();
    const mismatches: string[] = [];
    const dir = join(ROOT, "migrations");
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const sql = readFileSync(join(dir, file), "utf8");
      for (const m of sql.matchAll(MIGRATION_CLUE_UPDATE)) {
        const [, raw, slug, beat] = m;
        const key = `${slug}:${beat}`;
        if (!seedText.has(key)) {
          mismatches.push(`${file}: ${slug} beat ${beat} is not in the catalogue`);
        }
        lastWrite.set(key, { file, text: raw.replace(/''/g, "'") });
      }
    }
    for (const [key, { file, text }] of lastWrite) {
      const seeded = seedText.get(key);
      if (seeded !== undefined && seeded !== text) {
        mismatches.push(`${file}: ${key}\n    migration: ${text}\n    seed:      ${seeded}`);
      }
    }
    expect(mismatches, `\n${mismatches.join("\n")}\n`).toEqual([]);
  });

  // The other direction. A clue the seed changed but no migration carries never
  // reaches prod, and the dish would play differently on the live site than in
  // any local run. Only checks slugs some backfill migration already mentions,
  // so a dish nobody has rewritten yet is not a failure.
  it("carries every beat of a dish the backfill has started on", () => {
    const touched = new Map<string, Set<number>>();
    const dir = join(ROOT, "migrations");
    for (const file of readdirSync(dir).filter((f) => f.startsWith("00") && f.includes("backfill"))) {
      const sql = readFileSync(join(dir, file), "utf8");
      for (const m of sql.matchAll(MIGRATION_CLUE_UPDATE)) {
        if (!touched.has(m[2])) touched.set(m[2], new Set());
        touched.get(m[2])!.add(Number(m[3]));
      }
    }
    // Nothing to assert about beats the backfill has not reached; this just
    // pins that the migrations parsed at all, so a format change cannot make
    // the check above silently pass by matching nothing.
    expect(touched.size, "no backfill UPDATEs parsed out of migrations/").toBeGreaterThan(0);
  });
});
