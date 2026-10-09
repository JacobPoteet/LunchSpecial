#!/usr/bin/env node
// Apply a clue rewrite to both places a clue lives.
//
// The backfill (see .claude/skills/create-dishes/SKILL.md) rewrites clues in place rather than
// adding them, so hand-editing 1,905 rows across seed/seed.sql plus a migration
// is exactly the job a script should do. Feed it a patch:
//
//   { "pho": { "1": "A noodle soup from Southeast Asia.", "5": "…" } }
//
//   node scripts/patch-clues.mjs <patch.json> <migration-name>
//   node scripts/patch-clues.mjs --drinks <patch.json> <migration-name>
//
// --drinks does the same for After Dark: coasters 1-3 in drink_clues, keyed by
// drink slug. The seed writes those rows as (SELECT id FROM drinks WHERE
// slug='x'), so the slug is the key in both places.
//
// It rewrites the matching rows in seed/seed.sql (keyed by the dish id the seed
// already uses) and writes migrations/00NN_<migration-name>.sql as UPDATEs
// keyed by slug, which is what reaches prod. Re-running with the same migration
// name MERGES into that file: existing rows stay, a repeated (slug, beat) is
// replaced. It used to rebuild from scratch, which silently dropped 66 of the
// first 88 beat-1 rewrites out of the migration while leaving them in the seed,
// so prod would have received a quarter of the batch. data-integrity.test.ts
// now asserts the migration and the seed agree.
//
// It refuses to touch a slug it cannot find, and refuses to write a clue whose
// text did not change — both mean the patch is wrong about the catalogue.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = join(ROOT, "seed", "seed.sql");

const sqlEscape = (s) => s.replace(/'/g, "''");

/** One generated UPDATE, so a re-run can read back what it wrote last time. */
const MIGRATION_ROW =
  /UPDATE clues SET text = '((?:[^']|'')*)'\n WHERE dish_id = \(SELECT id FROM dishes WHERE slug = '([a-z0-9-]+)'\) AND order_index = (\d);/g;
const DRINK_MIGRATION_ROW =
  /UPDATE drink_clues SET text = '((?:[^']|'')*)'\n WHERE drink_id = \(SELECT id FROM drinks WHERE slug = '([a-z0-9-]+)'\) AND order_index = (\d);/g;

function main() {
  const args = process.argv.slice(2);
  const drinks = args[0] === "--drinks";
  const [patchPath, migrationName] = drinks ? args.slice(1) : args;
  if (!patchPath || !migrationName) {
    console.error("usage: patch-clues.mjs [--drinks] <patch.json> <migration-name>");
    process.exit(1);
  }
  const maxBeat = drinks ? 3 : 5;
  const noun = drinks ? "drink" : "dish";

  const patch = JSON.parse(readFileSync(patchPath, "utf8"));
  // The seed is CRLF on Windows checkouts. Match on LF, write back what was read.
  const raw = readFileSync(SEED, "utf8");
  const crlf = raw.includes("\r\n");
  let seed = raw.replace(/\r\n/g, "\n");

  // slug -> key, straight out of the seed's own INSERT rows. A dish row starts
  // with its literal id; a drink row has none, so the slug is the key.
  const slugToId = new Map();
  if (drinks) {
    for (const m of seed.matchAll(/^\('(?:[^']|'')*','([a-z0-9-]+)','/gm)) slugToId.set(m[1], m[1]);
  } else {
    for (const m of seed.matchAll(/^\((\d+),'(?:[^']|'')*','([a-z0-9-]+)',/gm)) {
      slugToId.set(m[2], Number(m[1]));
    }
  }

  const updates = [];
  const problems = [];

  for (const [slug, beats] of Object.entries(patch)) {
    const id = slugToId.get(slug);
    if (id === undefined) {
      problems.push(`${slug}: no such ${noun} in seed.sql`);
      continue;
    }
    for (const [beatKey, text] of Object.entries(beats)) {
      const beat = Number(beatKey);
      if (!(beat >= 1 && beat <= maxBeat)) {
        problems.push(`${slug}: beat ${beatKey} is not 1-${maxBeat}`);
        continue;
      }
      // The clue row as the seed writes it, terminated by either a comma or
      // the statement's semicolon.
      const row = drinks
        ? new RegExp(`^\\(\\(SELECT id FROM drinks WHERE slug='${id}'\\), ${beat}, '((?:[^']|'')*)'\\)(,|;)$`, "m")
        : new RegExp(`^\\(${id},${beat},'((?:[^']|'')*)'\\)(,|;)$`, "m");
      const rebuilt = (end) =>
        drinks
          ? `((SELECT id FROM drinks WHERE slug='${id}'), ${beat}, '${sqlEscape(text)}')${end}`
          : `(${id},${beat},'${sqlEscape(text)}')${end}`;
      const found = seed.match(row);
      if (!found) {
        problems.push(`${slug} beat ${beat}: row not found in seed.sql`);
        continue;
      }
      if (found[1] === sqlEscape(text)) {
        problems.push(`${slug} beat ${beat}: text is unchanged`);
        continue;
      }
      seed = seed.replace(row, () => rebuilt(found[2]));
      updates.push({ slug, beat, text });
    }
  }

  if (problems.length) {
    console.error("refusing to write:\n  " + problems.join("\n  "));
    process.exit(1);
  }

  // Next migration number, from whatever is already there.
  const existing = readdirSync(join(ROOT, "migrations")).filter((f) => f.endsWith(".sql"));
  const mine = existing.find((f) => f.endsWith(`_${migrationName}.sql`));
  const number = mine
    ? mine.slice(0, 4)
    : String(Math.max(...existing.map((f) => Number(f.slice(0, 4)))) + 1).padStart(4, "0");
  const file = join(ROOT, "migrations", `${number}_${migrationName}.sql`);

  // Merge with whatever that migration already holds, keyed by (slug, beat), so
  // a revised clue replaces its earlier version rather than appearing twice.
  const merged = new Map();
  try {
    const prior = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    for (const m of prior.matchAll(drinks ? DRINK_MIGRATION_ROW : MIGRATION_ROW)) {
      merged.set(`${m[2]}:${m[3]}`, {
        slug: m[2],
        beat: Number(m[3]),
        text: m[1].replace(/''/g, "'"),
      });
    }
  } catch {
    // No such migration yet, which is the common case.
  }
  for (const u of updates) merged.set(`${u.slug}:${u.beat}`, u);
  const all = [...merged.values()];

  const body = [
    `-- Backfill: clue rewrites against the beat sheet.`,
    `-- ${all.length} clues across ${new Set(all.map((u) => u.slug)).size} ${noun}s.`,
    `-- UPDATEs, not INSERTs: these rows already exist. Keyed by slug so the ids`,
    `-- this migration lands on do not have to match the seed's.`,
    `-- Generated by scripts/patch-clues.mjs. Edit the patch, not this file.`,
    "",
    ...all.map((u) =>
      drinks
        ? `UPDATE drink_clues SET text = '${sqlEscape(u.text)}'\n` +
          ` WHERE drink_id = (SELECT id FROM drinks WHERE slug = '${u.slug}') AND order_index = ${u.beat};`
        : `UPDATE clues SET text = '${sqlEscape(u.text)}'\n` +
          ` WHERE dish_id = (SELECT id FROM dishes WHERE slug = '${u.slug}') AND order_index = ${u.beat};`,
    ),
    "",
  ].join("\n");

  writeFileSync(SEED, crlf ? seed.replace(/\n/g, "\r\n") : seed);
  writeFileSync(file, body);

  console.log(
    `patched ${updates.length} clues across ${new Set(updates.map((u) => u.slug)).size} ${noun}s ` +
      `(migration now holds ${all.length})`,
  );
  console.log(`  seed/seed.sql`);
  console.log(`  migrations/${number}_${migrationName}.sql`);
}

main();
