// Builds marketing/keyart-*.jpg — the key art at every aspect ratio an ad
// platform asks for. Run: node scripts/build-keyart.mjs (or `npm run assets:keyart`)
//
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
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const conf = path.join(REPO, 'discord-assets', 'fonts.conf');

// fontconfig is a native lib and reads FONTCONFIG_FILE at process *start*, so an
// assignment here would be invisible to it. Same re-exec as discord-assets/build.mjs,
// and it shares that script's gitignored fonts.conf rather than writing a second one.
if (process.env.LS_ASSETS_REEXEC !== '1') {
  const fontsDir = path.join(REPO, 'src', 'assets', 'fonts').replace(/\\/g, '/');
  const cacheDir = path.join(os.tmpdir(), 'lunch-special-fc').replace(/\\/g, '/');
  fs.mkdirSync(path.dirname(conf), { recursive: true });
  fs.writeFileSync(
    conf,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>
`,
  );
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, FONTCONFIG_FILE: conf, LS_ASSETS_REEXEC: '1' },
  });
  process.exit(r.status ?? 1);
}

const sharp = (await import('sharp')).default;

const SRC = 'src/assets/art/diner-backdrop.png';
const OUT = 'marketing';

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
  ['1.91x1', 1200, 628, 1.0, 0.476, 0.941], // Reddit + Meta link ads
  ['16x9', 1280, 720, 1.0, 0.476, 0.941], // X, LinkedIn, YouTube
  ['4x3', 1200, 900, 1.06, 0.46, 0.93],
  ['1x1', 1080, 1080, 1.14, 0.45, 0.92], // square feed
  ['4x5', 1080, 1350, 1.22, 0.44, 0.9], // Meta feed, tallest non-story
  ['9x16', 1080, 1920, 1.3, 0.42, 0.88], // Stories / Reels
];

const TEXT = {
  word: 'Lunch Special',
  tag: 'THE DAILY DISH GUESSING GAME',
  // The flanking stars are drawn, not typed — see `star`.
  star: "GUESS TODAY'S SPECIAL",
  url: 'lunchspecial.app',
};

const STYLE = {
  word: { family: 'Yellowtail, cursive', fill: '#ffd9e0', lsK: 0 },
  tag: { family: "'Alfa Slab One', serif", fill: '#f6edd9', lsK: 0.267 },
  star: { family: "'Alfa Slab One', serif", fill: '#e8a53a', lsK: 0.267 },
  url: { family: "'Alfa Slab One', serif", fill: '#f6edd9', lsK: 0 },
};

/** Star glyph radius and its gap to the words, in units of the font size. */
const STAR_R = 0.4;
const STAR_GAP = 0.5;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

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
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
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
      blend: 'screen',
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
    .resize(rw, rh, { fit: 'fill' })
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

// ---- build ----
const PROBE = 100;
const unit = {};
for (const k of Object.keys(TEXT)) {
  const s = STYLE[k];
  unit[k] = (await inkWidth(TEXT[k], PROBE, { ...s, ls: PROBE * s.lsK })) / PROBE;
}

fs.mkdirSync(OUT, { recursive: true });

for (const [name, W, H, tScale, wy, uy] of TARGETS) {
  const photo = await sharp(await coverCrop(SRC, W, H, CROP_BIAS))
    .modulate({ saturation: GRADE.sat, brightness: GRADE.bri })
    .toBuffer();
  const tint = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#123833" fill-opacity="${GRADE.tint}"/></svg>`,
  );

  const size = {};
  for (const k of Object.keys(TEXT)) {
    // The star line's target width has to cover the drawn stars and their gaps,
    // so its size solves against a wider denominator than the ink alone.
    const denom = k === 'star' ? unit[k] + 2 * (2 * STAR_R + STAR_GAP) : unit[k];
    size[k] = (FRAC[k] * W * tScale) / denom;
  }

  // Spacing in units of the wordmark size, so the block stays a block rather
  // than drifting apart on a tall frame where the type scales with width.
  const s = size.word;
  const yWord = H * wy;
  const rows = [
    ['word', yWord],
    ['tag', yWord + s * 0.42],
    ['star', yWord + s * 0.84],
    ['url', H * uy],
  ];

  let body = '';
  for (const [k, y] of rows) {
    const st = STYLE[k];
    const fs2 = size[k];
    const ls = fs2 * st.lsK;
    // SVG letter-spacing is applied after the final glyph too, so a centred run
    // sits half a space left of true centre. Nudge it back.
    body += textSvg(TEXT[k], fs2, W / 2 + ls / 2, y, { ...st, ls });
    if (k === 'star') {
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
  const file = `${OUT}/keyart-${name}.jpg`;
  await sharp(photo)
    .composite([{ input: tint }, { input: vignette(W, H, GRADE) }, ...glow, { input: type }])
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toFile(file);

  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`keyart-${name}.jpg`.padEnd(22), `${W}x${H}`.padEnd(11), `${kb} KB`);
}
