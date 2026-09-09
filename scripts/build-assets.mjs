// Every generated art asset in the repo, in one build.
//
//   npm run assets                 # all three targets
//   npm run assets -- press        # one target (or: node scripts/build-assets.mjs press)
//
// | Target   | Reads                                  | Writes                       | Committed |
// |----------|----------------------------------------|------------------------------|-----------|
// | `icons`  | `public/favicon.svg`                   | `public/icon-*.png`, `apple-touch-icon.png` | yes |
// | `keyart` | `src/assets/art/diner-backdrop.png`    | `marketing/keyart-*.jpg`     | yes |
// | `press`  | `src/assets/art/app-icon.svg`, `public/og-image.jpg`, the backdrop | `public/press/*` | yes |
//
// All three outputs are committed and none of them is built by CI — these are
// maintainer one-offs, run when the source art changes and not before.
//
// This was four scripts (build-icons, build-keyart, build-press-kit and
// discord-assets/build.mjs). They were merged because two of them rasterised
// the same SVG, two of them wrote byte-identical PNGs into different folders,
// and both font-using ones carried their own copy of the fontconfig re-exec
// below. One script means one copy of that, and `press` is now the only place
// the shared images are produced — the Discord Portal uploads the same files.

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { statSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");

// ---------------------------------------------------------------------------
// fontconfig
// ---------------------------------------------------------------------------
// The SVG rasterising here resolves fonts against the repo's own font folder and
// nothing else, so type renders the same on any machine regardless of what is
// installed on it. sharp's librsvg finds them via fontconfig — but fontconfig is
// a native lib and reads FONTCONFIG_FILE from the OS environment at *process
// start*, so on Windows a `process.env` assignment made after startup is not
// visible to it. Hence: write a fonts.conf pointing at the repo font folder and
// re-exec ourselves once with FONTCONFIG_FILE set at spawn time. No extra deps,
// works on every platform.
//
// The conf goes in the OS temp dir beside fontconfig's own cache. It used to be
// written into `discord-assets/` and gitignored there, which is a generated file
// living in a source folder for no reason.
if (process.env.LS_ASSETS_REEXEC !== "1") {
  const fontsDir = join(REPO, "src", "assets", "fonts").replace(/\\/g, "/");
  const cacheDir = join(os.tmpdir(), "lunch-special-fc").replace(/\\/g, "/");
  const conf = join(cacheDir, "fonts.conf");
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(
    conf,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>
`,
  );
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, FONTCONFIG_FILE: conf, LS_ASSETS_REEXEC: "1" },
  });
  process.exit(r.status ?? 1);
}

// From here on FONTCONFIG_FILE was set at process start, so librsvg sees the fonts.
const sharp = (await import("sharp")).default;

const kb = (f) => `${(statSync(join(REPO, f)).size / 1024).toFixed(0)} KB`;
const report = (f, dims) => console.log(`  ${f.padEnd(42)} ${String(dims).padEnd(11)} ${kb(f)}`);
const at = (...p) => join(REPO, ...p);

// ---------------------------------------------------------------------------
// icons — the web app manifest + iOS home screen
// ---------------------------------------------------------------------------
// Source of truth is public/favicon.svg: this reads its inner markup rather than
// redrawing the mark, so a new favicon propagates to every icon on the next run.
//
// Two shapes come out of it:
//   * "any"      — the mark edge to edge, transparent corners. What browsers
//                  show in tabs, install prompts and task switchers.
//   * "maskable" — the mark inset on an opaque teal field. Android crops
//                  adaptive icons to whatever shape the launcher uses (circle,
//                  squircle, rounded square), taking up to 20% off each edge;
//                  an "any" icon fed through that loses its rim. The Apple touch
//                  icon uses the same padded artwork because iOS also composites
//                  onto its own rounded rect and renders transparency as black.

// Matches --teal / theme_color, so the maskable field, the manifest background
// and the browser chrome are one colour.
const FIELD = "#1b4f4a";
// Fraction of the icon the mark occupies inside the maskable safe zone. 0.6
// keeps the whole mark clear of the 20% Android may crop, with margin to spare.
const MARK_SCALE = 0.6;
const VIEWBOX = 64;

const ICONS = [
  { file: "icon-192.png", size: 192, padded: false },
  { file: "icon-512.png", size: 512, padded: false },
  { file: "icon-maskable-512.png", size: 512, padded: true },
  { file: "apple-touch-icon.png", size: 180, padded: true },
];

function wrapMark(mark, padded) {
  if (!padded) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">${mark}</svg>`;
  }
  const offset = (VIEWBOX * (1 - MARK_SCALE)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">
    <rect width="${VIEWBOX}" height="${VIEWBOX}" fill="${FIELD}"/>
    <g transform="translate(${offset} ${offset}) scale(${MARK_SCALE})">${mark}</g>
  </svg>`;
}

async function icons() {
  const svg = await readFile(at("public", "favicon.svg"), "utf8");
  const inner = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!inner) throw new Error("public/favicon.svg: couldn't find the <svg> body");
  const mark = inner[1].trim();

  for (const { file, size, padded } of ICONS) {
    // librsvg rasterises at 96dpi against the viewBox's user units, so an
    // unscaled render would be 64px and upscaling it would soften the edges.
    // Raising the density makes it rasterise at the target size instead.
    const density = Math.ceil((96 * size) / VIEWBOX);
    const png = await sharp(Buffer.from(wrapMark(mark, padded)), { density })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(at("public", file), png);
    report(`public/${file}`, `${size}x${size}`);
  }
}

// ---------------------------------------------------------------------------
// press — public/press/, and the three images Discord's Portal also takes
// ---------------------------------------------------------------------------
// These ship on every deploy, so the folder stays lean. Each image comes out
// twice: a PNG the page offers as a download, and a JPEG the page itself loads.
// The sources are photographic (diner-backdrop.png is, despite the extension, a
// JPEG) so PNG buys nothing but bytes on a page view — the backdrop is the hero's
// CSS background and was costing 2.2 MB of PNG-encoded JPEG artefacts.
//
// `discord-assets/` used to hold its own build writing byte-identical copies of
// key-art.png and backdrop.png under different names. The press page already
// labelled the single copies with their Discord roles, so the second set was
// 3.6 MB of pure duplication that could also silently drift. The Portal upload
// is by hand, so it uploads these.

const PRESS = "public/press";
// Discord's Activity art wants ≥1024 wide at 16:9; 1280x720 is comfortably above
// that and sharp on hi-dpi. The press page uses the same pair.
const SHARE_W = 1280;
const SHARE_H = 720;

async function press() {
  await mkdir(at(PRESS), { recursive: true });

  // -- app icon: the cloche mark on its cherry radial ground, 1024 square.
  // Discord shows it circle-masked in some places and square in others, which is
  // why the SVG is full-bleed. The `?` is set in Alfa Slab One via the fontconfig
  // above rather than whatever serif the machine happens to have.
  await sharp(at("src", "assets", "art", "app-icon.svg"), { density: 384 })
    .resize(1024, 1024)
    .png({ compressionLevel: 9 })
    .toFile(at(PRESS, "app-icon.png"));
  report(`${PRESS}/app-icon.png`, "1024x1024");

  // -- key art: the social card, fitted to 16:9.
  //
  // It is the same picture the site already hands to Twitter, Facebook, Discord
  // unfurls and iMessage, so a pasted link and the Activity Shelf look like one
  // product instead of two takes on it. That card is also the better piece of
  // design than the composition this replaced: one-line wordmark, the "GUESS
  // TODAY'S SPECIAL" star line, and the URL.
  //
  // og-image.jpg is 1200x630 (1.90:1), flatter than 16:9, so something has to give:
  //   - Cropping to height (720/630) would scale the type up 14% and eat 45px off
  //     each side of a design whose type already runs nearly edge to edge.
  //   - Fitting to width lands on 1280x672 with the whole composition intact, and
  //     leaves 48px of height to find.
  // So: fit the width, then extend 24px top and bottom with `copy` (edge pixels
  // replicated). The top edge is flat ceiling and the bottom is the vignette, so
  // the band is invisible; mirroring would double the ceiling lights and a solid
  // bar would seam against the lit ceiling. Nothing in the design is cropped.
  //
  // Caveat worth knowing before you retune this: Discord also crops the cover to
  // 13:11 (the centered 851px of 1280), and the one-line wordmark is 863px wide
  // here, so that crop clips the L swash and the tail of "Special". The 16:9 hero
  // is the placement that matters and it is whole; making both fit would mean
  // redrawing the type smaller, i.e. no longer shipping the og-image.
  const keyArt = sharp(at("public", "og-image.jpg"))
    .resize(SHARE_W, 672, { fit: "fill" })
    .extend({ top: 24, bottom: 24, extendWith: "copy" });
  await keyArt.clone().png({ compressionLevel: 9 }).toFile(at(PRESS, "key-art.png"));
  // 4:4:4 because the neon wordmark is saturated pink on dark teal, and chroma
  // subsampling smears exactly that edge.
  await keyArt.clone().jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toFile(at(PRESS, "key-art.jpg"));
  report(`${PRESS}/key-art.png`, `${SHARE_W}x${SHARE_H}`);
  report(`${PRESS}/key-art.jpg`, `${SHARE_W}x${SHARE_H}`);

  // -- backdrop: the untyped diner interior, cropped to 16:9. Discord's Grid view
  // sits its own chrome over this, which is why it carries no type.
  const backdrop = sharp(at("src", "assets", "art", "diner-backdrop.png")).resize(SHARE_W, SHARE_H, {
    fit: "cover",
    position: "attention",
  });
  await backdrop.clone().png({ compressionLevel: 9 }).toFile(at(PRESS, "backdrop.png"));
  await backdrop.clone().jpeg({ quality: 86 }).toFile(at(PRESS, "backdrop.jpg"));
  report(`${PRESS}/backdrop.png`, `${SHARE_W}x${SHARE_H}`);
  report(`${PRESS}/backdrop.jpg`, `${SHARE_W}x${SHARE_H}`);

  // -- the two OFL faces, as stable-URL press downloads. src/assets/fonts/ is the
  // game bundle, where Vite content-hashes the filenames; the press page needs a
  // URL it can print. Copied rather than deduped for that reason — see ASSETS.md.
  await mkdir(at(PRESS, "fonts"), { recursive: true });
  for (const f of ["alfa-slab-one.ttf", "yellowtail.ttf"]) {
    await copyFile(at("src", "assets", "fonts", f), at(PRESS, "fonts", f));
    report(`${PRESS}/fonts/${f}`, "");
  }
}

// ---------------------------------------------------------------------------
// keyart — marketing/keyart-*.jpg, the ad sizes
// ---------------------------------------------------------------------------
// NOT a re-crop of public/og-image.jpg. That card's type runs nearly edge to
// edge (the wordmark alone is 809 of its 1200px), so any reframe either clips
// the lettering or letterboxes the picture. This composes from the parts
// instead — the clean, untyped diner backdrop, the grade og-image applies to it,
// and the type re-rendered as vector at output resolution. The photo reframes
// and the type stays sharp, which is what lets a 9:16 exist at all.
//
// Three things here were measured against public/og-image.jpg rather than
// eyeballed, and the numbers are in the comments so they can be re-derived:
// the crop bias, the colour grade, and the neon bloom.

const KEYART_SRC = "src/assets/art/diner-backdrop.png";
const KEYART_OUT = "marketing";

// Fitted by grid search against og-image.jpg outside its type area: teal scrim,
// mild desaturation, soft radial vignette. Mean abs error 6.1/255 per channel,
// against 32.7 for the ungraded backdrop.
const GRADE = { sat: 0.76, bri: 0.96, vs: 0.37, vr: 78, tint: 0.36 };

// og-image takes its 628 rows starting 59px into an 807px frame — 0.33, not the
// 0.5 a plain centre crop gives. Keeping that bias holds the ceiling lights and
// the neon in frame and trims floor instead, which is right at every ratio.
const CROP_BIAS = 0.33;

// Element ink widths as a fraction of frame width, measured off og-image.jpg.
// One shared scale per ratio keeps their proportions to each other exact.
const FRAC = { word: 0.674, tag: 0.652, star: 0.34, url: 0.199 };

// name, W, H, type scale, wordmark baseline, url baseline (last two as H fractions).
// Type scales up on taller frames: 67% of width reads small in a phone story,
// where the frame is mostly room and the viewer is further from the content.
const TARGETS = [
  ["1.91x1", 1200, 628, 1.0, 0.476, 0.941], // Reddit + Meta link ads
  ["16x9", 1280, 720, 1.0, 0.476, 0.941], // X, LinkedIn, YouTube
  ["4x3", 1200, 900, 1.06, 0.46, 0.93],
  ["1x1", 1080, 1080, 1.14, 0.45, 0.92], // square feed
  ["4x5", 1080, 1350, 1.22, 0.44, 0.9], // Meta feed, tallest non-story
  ["9x16", 1080, 1920, 1.3, 0.42, 0.88], // Stories / Reels
];

const TEXT = {
  word: "Lunch Special",
  tag: "THE DAILY DISH GUESSING GAME",
  // The flanking stars are drawn, not typed — see `star`.
  star: "GUESS TODAY'S SPECIAL",
  url: "lunchspecial.app",
};

const STYLE = {
  word: { family: "Yellowtail, cursive", fill: "#ffd9e0", lsK: 0 },
  tag: { family: "'Alfa Slab One', serif", fill: "#f6edd9", lsK: 0.267 },
  star: { family: "'Alfa Slab One', serif", fill: "#e8a53a", lsK: 0.267 },
  url: { family: "'Alfa Slab One', serif", fill: "#f6edd9", lsK: 0 },
};

/** Star glyph radius and its gap to the words, in units of the font size. */
const STAR_R = 0.4;
const STAR_GAP = 0.5;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/**
 * One text element as SVG. No filter: the neon bloom used to be three stacked
 * `feDropShadow`s, which librsvg silently drops almost entirely through sharp —
 * measured halo-to-core came out 0.19 against the real card's 1.36. See `neonLayers`.
 */
const textSvg = (t, size, cx, y, { family, fill, ls = 0 }) =>
  `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${family}" font-size="${size}" letter-spacing="${ls}" fill="${fill}">${esc(t)}</text>`;

/**
 * A five-pointed star as a path. Alfa Slab One has no U+2605, and the restricted
 * fontconfig above has no fallback family, so the character rendered as tofu.
 */
function star(cx, cy, r, fill) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
}

/** Ink width at `probe`, so a font size can be solved for a target width (it's linear). */
async function inkWidth(t, probe, style) {
  const W = Math.ceil(probe * t.length * 1.6) + 400;
  const H = Math.ceil(probe * 3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>${textSvg(t, probe, W / 2, H * 0.6, style)}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  let x0 = W;
  let x1 = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 40 || data[i + 1] > 40 || data[i + 2] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }
  return x1 > x0 ? x1 - x0 + 1 : 1;
}

/**
 * The neon bloom: three pink copies of the wordmark at widening blur radii,
 * screened onto the plate before the crisp core goes on top.
 *
 * Each layer is drawn on **black and screened**, not left transparent. Blurring
 * a thin script stroke by a wide radius spreads its alpha until the peak is
 * almost nothing — a transparent version of this measured 0.17 halo-to-core,
 * barely better than the broken filter it replaced. Screening against black is
 * exact (screen(base, black) is base, so untouched areas stay untouched) and it
 * moves the intensity into the colour, where `gain` can amplify what the blur
 * flattened. Screen is also the physically right blend: a tube adds light to
 * what is behind it, where `over` would fog the photo into a pink haze.
 *
 * Each layer strokes the glyphs before blurring, because a tube glows off its
 * whole surface rather than off a hairline.
 *
 * Radii and gains were tuned by counting pink halo pixels against core ink
 * pixels: og-image sits at 36711 halo / 27005 core, this lands 36923 / 28745.
 * Radii are in units of font size, so the bloom scales with the frame.
 */
async function neonLayers(text, size, cx, y, family, W, H) {
  const spec = [
    { k: 0.035, stroke: 0, gain: 0.3 },
    { k: 0.09, stroke: 0.008, gain: 0.9 },
    { k: 0.2, stroke: 0.016, gain: 1.5 },
  ];
  const out = [];
  for (const { k, stroke, gain } of spec) {
    const glyph = `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${family}" font-size="${size}" fill="#ff5f7a" stroke="#ff5f7a" stroke-width="${(size * stroke).toFixed(2)}" stroke-linejoin="round">${esc(text)}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>${glyph}</svg>`;
    out.push({
      input: await sharp(Buffer.from(svg))
        .blur(Math.max(0.3, size * k))
        .linear(gain, 0)
        .removeAlpha()
        .toBuffer(),
      blend: "screen",
    });
  }
  return out;
}

/** Cover-crop with a bias, which sharp's `position` can't express. */
async function coverCrop(src, W, H, bias) {
  const meta = await sharp(src).metadata();
  const scale = Math.max(W / meta.width, H / meta.height);
  const rw = Math.ceil(meta.width * scale);
  const rh = Math.ceil(meta.height * scale);
  return sharp(src)
    .resize(rw, rh, { fit: "fill" })
    .extract({
      left: Math.round((rw - W) * bias),
      top: Math.round((rh - H) * bias),
      width: W,
      height: H,
    })
    .toBuffer();
}

const vignette = (W, H, g) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="v" cx="50%" cy="50%" r="${g.vr}%">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.55" stop-color="#000" stop-opacity="${(g.vs * 0.28).toFixed(3)}"/>
      <stop offset="1" stop-color="#000" stop-opacity="${g.vs.toFixed(3)}"/>
    </radialGradient></defs><rect width="${W}" height="${H}" fill="url(#v)"/></svg>`);

async function keyart() {
  const PROBE = 100;
  const unit = {};
  for (const k of Object.keys(TEXT)) {
    const s = STYLE[k];
    unit[k] = (await inkWidth(TEXT[k], PROBE, { ...s, ls: PROBE * s.lsK })) / PROBE;
  }

  await mkdir(at(KEYART_OUT), { recursive: true });

  for (const [name, W, H, tScale, wy, uy] of TARGETS) {
    const photo = await sharp(await coverCrop(at(KEYART_SRC), W, H, CROP_BIAS))
      .modulate({ saturation: GRADE.sat, brightness: GRADE.bri })
      .toBuffer();
    const tint = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#123833" fill-opacity="${GRADE.tint}"/></svg>`,
    );

    const size = {};
    for (const k of Object.keys(TEXT)) {
      // The star line's target width has to cover the drawn stars and their gaps,
      // so its size solves against a wider denominator than the ink alone.
      const denom = k === "star" ? unit[k] + 2 * (2 * STAR_R + STAR_GAP) : unit[k];
      size[k] = (FRAC[k] * W * tScale) / denom;
    }

    // Spacing in units of the wordmark size, so the block stays a block rather
    // than drifting apart on a tall frame where the type scales with width.
    const s = size.word;
    const yWord = H * wy;
    const rows = [
      ["word", yWord],
      ["tag", yWord + s * 0.42],
      ["star", yWord + s * 0.84],
      ["url", H * uy],
    ];

    let body = "";
    for (const [k, y] of rows) {
      const st = STYLE[k];
      const fs2 = size[k];
      const ls = fs2 * st.lsK;
      // SVG letter-spacing is applied after the final glyph too, so a centred run
      // sits half a space left of true centre. Nudge it back.
      body += textSvg(TEXT[k], fs2, W / 2 + ls / 2, y, { ...st, ls });
      if (k === "star") {
        const half = (unit[k] * fs2) / 2;
        const r = STAR_R * fs2;
        const sy = y - fs2 * 0.32; // optical middle of the caps, not the baseline
        body += star(W / 2 - half - STAR_GAP * fs2 - r, sy, r, st.fill);
        body += star(W / 2 + half + STAR_GAP * fs2 + r, sy, r, st.fill);
      }
    }
    const type = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`,
    );

    // Grade the plate, bloom the neon onto it, then lay the crisp type over its glow.
    const glow = await neonLayers(TEXT.word, s, W / 2, yWord, STYLE.word.family, W, H);
    const file = `${KEYART_OUT}/keyart-${name}.jpg`;
    await sharp(photo)
      .composite([{ input: tint }, { input: vignette(W, H, GRADE) }, ...glow, { input: type }])
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toFile(at(file));
    report(file, `${W}x${H}`);
  }
}

// ---------------------------------------------------------------------------

const TASKS = { icons, press, keyart };

const asked = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const unknown = asked.filter((a) => !(a in TASKS));
if (unknown.length) {
  console.error(`unknown target: ${unknown.join(", ")}\nknown: ${Object.keys(TASKS).join(", ")}`);
  process.exit(1);
}

for (const name of asked.length ? asked : Object.keys(TASKS)) {
  console.log(`\n${name}`);
  await TASKS[name]();
}
