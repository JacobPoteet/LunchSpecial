// Builds Discord Activity art assets from existing game art.
// Run: node discord-assets/build.mjs   (from repo root)
//
// The neon wordmark uses the real OFL fonts (Yellowtail / Alfa Slab One). sharp's
// librsvg finds them via fontconfig — but fontconfig (a native lib) reads
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

// ---- 3. Cover art: backdrop (16:9) + neon wordmark overlay, 1280x720 ----
const W = 1280, H = 720;
const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1f1c" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#0b1f1c" stop-opacity="0.15"/>
      <stop offset="1" stop-color="#0b1f1c" stop-opacity="0.8"/>
    </linearGradient>
    <!-- matches the in-game .marquee__script neon: #ffd9e0 core + 3-layer
         neon-pink glow (game.css uses 6/18/42px shadows; scaled ~3x here). -->
    <filter id="neon" x="-70%" y="-70%" width="240%" height="240%">
      <feDropShadow dx="0" dy="0" stdDeviation="9" flood-color="#ff5f7a" flood-opacity="0.9"/>
      <feDropShadow dx="0" dy="0" stdDeviation="26" flood-color="#ff5f7a" flood-opacity="0.75"/>
      <feDropShadow dx="0" dy="0" stdDeviation="60" flood-color="#ff5f7a" flood-opacity="0.6"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  <!-- keep the title inside the centered 13:11 crop-safe band -->
  <g text-anchor="middle" filter="url(#neon)" fill="#ffd9e0" font-size="200">
    <text x="${W / 2}" y="430" font-family="Yellowtail, cursive">Lunch</text>
    <text x="${W / 2}" y="590" font-family="Yellowtail, cursive">Special</text>
  </g>
  <text x="${W / 2}" y="664" text-anchor="middle" font-family="'Alfa Slab One', serif" font-size="30" letter-spacing="8" fill="#f6edd9">THE DAILY DISH GUESSING GAME</text>
</svg>`;

await sharp('src/assets/art/diner-backdrop.png')
  .resize(W, H, { fit: 'cover', position: 'attention' })
  .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
  .png()
  .toFile(`${OUT}/cover-art.png`);

// ---- report ----
for (const f of ['app-icon.png', 'embedded-background.png', 'cover-art.png']) {
  const m = await sharp(`${OUT}/${f}`).metadata();
  const kb = (fs.statSync(`${OUT}/${f}`).size / 1024).toFixed(0);
  console.log(f.padEnd(24), `${m.width}x${m.height}`, `${kb} KB`);
}
