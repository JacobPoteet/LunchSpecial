// Builds Discord Activity art assets from existing game art.
// Run: node discord-assets/build.mjs   (from repo root)
//
// The SVG rasterizing here resolves fonts against the repo's own font folder and
// nothing else, so the icon renders the same on any machine regardless of what is
// installed on it. sharp's librsvg finds them via fontconfig — but fontconfig (a
// native lib) reads
// FONTCONFIG_FILE from the OS environment at *process start*, and on Windows a
// process.env assignment made after startup is NOT visible to native libs. So we
// write a fonts.conf pointing at the repo font folder and re-exec ourselves once
// with FONTCONFIG_FILE set at spawn time. No extra deps; works on every platform.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const conf = path.join(HERE, 'fonts.conf');

if (process.env.LS_ASSETS_REEXEC !== '1') {
  const REPO = path.resolve(HERE, '..');
  const fontsDir = path.join(REPO, 'src', 'assets', 'fonts').replace(/\\/g, '/');
  const cacheDir = path.join(os.tmpdir(), 'lunch-special-fc').replace(/\\/g, '/');
  fs.writeFileSync(conf, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>
`);
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, FONTCONFIG_FILE: conf, LS_ASSETS_REEXEC: '1' },
  });
  process.exit(r.status ?? 1);
}

// From here on FONTCONFIG_FILE was set at process start, so librsvg sees the fonts.
const sharp = (await import('sharp')).default;

const OUT = 'discord-assets';

// ---- 1. App icon: rasterize the SVG to 1024x1024 PNG ----
await sharp(`${OUT}/app-icon.svg`, { density: 384 })
  .resize(1024, 1024)
  .png()
  .toFile(`${OUT}/app-icon.png`);

// ---- 2. Embedded background: crop backdrop to 16:9, 1280x720 ----
await sharp('src/assets/art/diner-backdrop.png')
  .resize(1280, 720, { fit: 'cover', position: 'attention' })
  .png()
  .toFile(`${OUT}/embedded-background.png`);

// ---- 3. Cover art: the social card (public/og-image.jpg), fitted to 16:9 ----
//
// The cover used to be composed here — backdrop + a two-line Yellowtail wordmark
// drawn in SVG. It is now the same picture the site already hands to Twitter,
// Facebook, Discord unfurls and iMessage, so the Activity Shelf and a pasted link
// look like one product instead of two takes on it. That card is also the better
// piece of design: one-line wordmark, the "GUESS TODAY'S SPECIAL" star line, and
// the URL, which the generated version never had.
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
await sharp('public/og-image.jpg')
  .resize(1280, 672, { fit: 'fill' })
  .extend({ top: 24, bottom: 24, extendWith: 'copy' })
  .png({ compressionLevel: 9 })
  .toFile(`${OUT}/cover-art.png`);

// ---- report ----
for (const f of ['app-icon.png', 'embedded-background.png', 'cover-art.png']) {
  const m = await sharp(`${OUT}/${f}`).metadata();
  const kb = (fs.statSync(`${OUT}/${f}`).size / 1024).toFixed(0);
  console.log(f.padEnd(24), `${m.width}x${m.height}`, `${kb} KB`);
}
