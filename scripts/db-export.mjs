// Dumps a D1 database to a timestamped .sql file in backups/ (gitignored).
// Run: npm run db:export:remote   (or db:export / db:export:catalog)
//
// Why this exists: prod D1 is the ONLY copy of anything the admin dashboard
// writes — the schedule, dish edits, analytics_rounds, dish_requests. None of
// it has a repo representation: seed.sql + migrations/ only reconstruct the
// dish POOL. Losing the database loses every scheduled Special you booked by
// hand. There was no export path before this script.
//
// Two modes:
//   full     — every table. The real restore point. Contains analytics_rounds,
//              which holds anonymous per-device player_id UUIDs, so these dumps
//              stay local (backups/ is gitignored) and out of the repo.
//   catalog  — dishes + clues + schedule only. No player data, so it's the one
//              that's safe to hand around or diff against seed.sql when you
//              want to see how far admin edits have drifted.
//
// No new deps — just spawns the wrangler already in devDependencies.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const DB = 'lunch-special-db';
const OUT_DIR = 'backups';

// dishes/clues/schedule = the curated catalog. Everything else is either
// generated (analytics) or an inbox (dish_requests).
const CATALOG_TABLES = ['dishes', 'clues', 'schedule'];

const args = process.argv.slice(2);
const local = args.includes('--local');
const catalog = args.includes('--catalog');

// Local time, not UTC: these are named for the human running the backup.
// Colons are illegal in Windows filenames, so the clock is dash-separated.
const now = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;

const label = `${local ? 'local' : 'prod'}-${catalog ? 'catalog' : 'full'}`;
const out = `${OUT_DIR}/${label}-${stamp}.sql`;

fs.mkdirSync(OUT_DIR, { recursive: true });

const wranglerArgs = [
  'd1', 'export', DB,
  local ? '--local' : '--remote',
  `--output=${out}`,
  // Read-only dump; nothing to confirm, and prompting would hang a CI/agent run.
  '--skip-confirmation',
  ...(catalog ? CATALOG_TABLES.flatMap((t) => ['--table', t]) : []),
];

console.log(`Exporting ${local ? 'LOCAL' : 'REMOTE'} ${DB} (${catalog ? 'catalog only' : 'all tables'}) → ${out}`);

// Run wrangler's entry script on this same node, rather than shelling out to
// `npx`: no shell means no DEP0190 warning and no cross-platform quoting. Its
// package `exports` blocks resolving bin/ directly, so go via the manifest.
const require = createRequire(import.meta.url);
const pkgPath = require.resolve('wrangler/package.json');
const wranglerBin = path.join(path.dirname(pkgPath), require(pkgPath).bin.wrangler);

const res = spawnSync(process.execPath, [wranglerBin, ...wranglerArgs], { stdio: 'inherit' });

if (res.status !== 0) {
  console.error('\nExport failed. If this is a remote export, check `npx wrangler login`.');
  process.exit(res.status ?? 1);
}

const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`\n${out}  ${kb} KB`);
console.log(`Restore with:  npx wrangler d1 execute ${DB} ${local ? '--local' : '--remote'} --file=${out}`);
