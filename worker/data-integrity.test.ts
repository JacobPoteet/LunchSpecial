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
