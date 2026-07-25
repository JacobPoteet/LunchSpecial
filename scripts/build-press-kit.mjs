// Builds public/press/lunch-special-press-kit.zip from the loose press assets.
// Run: node scripts/build-press-kit.mjs   (from repo root, or `npm run assets:press`)
//
// Hand-rolled ZIP writer on node:zlib — no new deps (the repo keeps its runtime
// deps to hono/react/react-dom, and this is a manual, occasional script).
//
// Two things the old PowerShell-built zip got wrong, both fixed here:
//   1. Compress-Archive (PS 5.1) writes BACKSLASH path separators. The ZIP spec
//      requires forward slashes, so macOS/Linux extractors produced a literal
//      file named `fonts\alfa-slab-one.ttf` instead of a fonts/ directory.
//   2. It carried cover-art.png and embedded-background.png, which are
//      byte-identical to key-art.png and backdrop.png — 4.4 MB of pure
//      duplication. press.html already labels the single copies with their
//      Discord roles, so only one name each is shipped.
//
// Timestamps are pinned so rebuilds are byte-stable and don't churn git.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = 'public/press/lunch-special-press-kit.zip';

// [source path, name inside the zip]. Order is the listing order.
const ENTRIES = [
  ['public/press/app-icon.png', 'app-icon.png'],
  ['public/press/key-art.png', 'key-art.png'],
  ['public/press/backdrop.png', 'backdrop.png'],
  ['public/press/favicon.svg', 'favicon.svg'],
  ['public/press/fonts/alfa-slab-one.ttf', 'fonts/alfa-slab-one.ttf'],
  ['public/press/fonts/yellowtail.ttf', 'fonts/yellowtail.ttf'],
  ['discord-assets/preview.mp4', 'preview.mp4'],
];

// Fixed DOS timestamp (2026-01-01 00:00:00) so the output is reproducible.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const crc32 = (buf) => zlib.crc32(buf) >>> 0;

const locals = [];
const central = [];
let offset = 0;

for (const [src, name] of ENTRIES) {
  const raw = fs.readFileSync(src);
  // PNG/MP4/TTF are already compressed; deflate only if it actually helps.
  const deflated = zlib.deflateRawSync(raw, { level: 9 });
  const useDeflate = deflated.length < raw.length;
  const body = useDeflate ? deflated : raw;
  const method = useDeflate ? 8 : 0;
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header signature
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // extra field length
  locals.push(local, nameBuf, body);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); // central directory signature
  cd.writeUInt16LE(20, 4); // version made by
  cd.writeUInt16LE(20, 6); // version needed
  cd.writeUInt16LE(0, 8); // flags
  cd.writeUInt16LE(method, 10);
  cd.writeUInt16LE(DOS_TIME, 12);
  cd.writeUInt16LE(DOS_DATE, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(body.length, 20);
  cd.writeUInt32LE(raw.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt16LE(0, 30); // extra field length
  cd.writeUInt16LE(0, 32); // comment length
  cd.writeUInt16LE(0, 34); // disk number start
  cd.writeUInt16LE(0, 36); // internal attributes
  // external attributes (unix 0644); >>> 0 because << 16 overflows into a
  // negative signed int32 and writeUInt32LE rejects it.
  cd.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  cd.writeUInt32LE(offset, 42); // relative offset of local header
  central.push(cd, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}

const cdBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
eocd.writeUInt16LE(0, 4); // this disk
eocd.writeUInt16LE(0, 6); // disk with central directory
eocd.writeUInt16LE(ENTRIES.length, 8);
eocd.writeUInt16LE(ENTRIES.length, 10);
eocd.writeUInt32LE(cdBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20); // comment length

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([...locals, cdBuf, eocd]));

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
for (const [src, name] of ENTRIES) {
  console.log(name.padEnd(28), kb(fs.statSync(src).size));
}
console.log('-'.repeat(40));
console.log(`${OUT}  ${kb(fs.statSync(OUT).size)}`);
