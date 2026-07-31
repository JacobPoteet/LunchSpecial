// Rasterise the app icons for the web app manifest + iOS home screen.
//
//   node scripts/build-icons.mjs      (or: npm run assets:icons)
//
// Source of truth is public/favicon.svg — this reads its inner markup rather
// than redrawing the mark, so a new favicon propagates to every icon on the
// next run. Outputs are committed; this only needs re-running when the mark
// changes.
//
// Two shapes come out of it:
//   * "any"      — the mark edge to edge, transparent corners. What browsers
//                  show in tabs, install prompts and task switchers.
//   * "maskable" — the mark inset on an opaque teal field. Android crops
//                  adaptive icons to whatever shape the launcher uses (circle,
//                  squircle, rounded square), taking up to 20% off each edge;
//                  an "any" icon fed through that loses its rim. The Apple
//                  touch icon uses the same padded artwork because iOS also
//                  composites onto its own rounded rect and renders any
//                  transparency as black.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

// Matches --teal / theme_color, so the maskable field, the manifest background
// and the browser chrome are one colour.
const FIELD = "#1b4f4a";
// Fraction of the icon the mark occupies inside the maskable safe zone. 0.6
// keeps the whole mark clear of the 20% Android may crop, with margin to spare.
const MARK_SCALE = 0.6;
const VIEWBOX = 64;

const OUTPUTS = [
  { file: "icon-192.png", size: 192, padded: false },
  { file: "icon-512.png", size: 512, padded: false },
  { file: "icon-maskable-512.png", size: 512, padded: true },
  { file: "apple-touch-icon.png", size: 180, padded: true },
];

/** The favicon's drawing commands, without its own <svg> wrapper. */
async function readMark() {
  const svg = await readFile(join(publicDir, "favicon.svg"), "utf8");
  const inner = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!inner) throw new Error("public/favicon.svg: couldn't find the <svg> body");
  return inner[1].trim();
}

function wrap(mark, padded) {
  if (!padded) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">${mark}</svg>`;
  }
  const offset = (VIEWBOX * (1 - MARK_SCALE)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">
    <rect width="${VIEWBOX}" height="${VIEWBOX}" fill="${FIELD}"/>
    <g transform="translate(${offset} ${offset}) scale(${MARK_SCALE})">${mark}</g>
  </svg>`;
}

const mark = await readMark();

for (const { file, size, padded } of OUTPUTS) {
  const svg = wrap(mark, padded);
  // librsvg rasterises at 96dpi against the viewBox's user units, so an
  // unscaled render would be 64px and upscaling it would soften the edges.
  // Raising the density makes it rasterise at the target size instead.
  const density = Math.ceil((96 * size) / VIEWBOX);
  const png = await sharp(Buffer.from(svg), { density }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(join(publicDir, file), png);
  console.log(`${file.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)}kB`);
}
