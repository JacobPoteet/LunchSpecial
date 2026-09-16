# Art manifest — Lunch Special

**Every visual asset in this project is currently an AI-generated placeholder.** This file is the handoff document for a commissioned artist: what each asset is, where it appears, its target size, and the style intent. Replacing a file in place (same path, same viewBox proportions) requires no code changes.

Each SVG also carries a header comment: `<!-- AI-GENERATED PLACEHOLDER — replace with commissioned art. See ASSETS.md -->`. Please keep a comment crediting the new artist when swapping.

## Style direction

Golden-age American diner, roughly 1950s: cream + chrome + cherry-red + deep teal, checkerboard floors, neon signage, warm pendant light. Current placeholders are flat vector; the commissioned art can be more painterly or textured as long as the game UI (menu card, tickets) stays readable on top of the backdrop.

## Palette in use (CSS variables in `src/styles/base.css`)

| Token | Hex | Use |
|---|---|---|
| `--cream` | `#f6edd9` | paper, text on dark |
| `--teal` / `--teal-dark` | `#1b4f4a` / `#123833` | walls, chrome shadows, app background |
| `--cherry` / `--cherry-dark` | `#c9354a` / `#8f1f2e` | booths, stools, accents |
| `--mustard` | `#e8a53a` | "near" matches, highlights |
| `--neon-pink` | `#ff5f7a` | neon sign glow |
| `--chrome` | `#cfd8dc` | metal trim |

## Assets

### `src/assets/art/diner-backdrop.png`
- **What**: Painterly night-time diner interior — red vinyl booths and jukebox at left, chrome-edged counter with red stools, "Mel's Diner" neon sign and menu board, pendant lamps, a classic car visible through the window. Replaces the earlier `ai-diner-scene.svg` vector placeholder with a raster illustration.
- **Where**: CSS `background-image` of the entire game screen (`.scene`), behind the menu card.
- **Size**: 1680×948px, rendered `cover` at any viewport; `background-position: center 30%` keeps the counter/signage centered and crops the edges first, so keep interest away from the extreme left/right.
- **Notes**: Already dark/mid-tone enough for the cream menu card to pop on top. Swap this file in place (same path, same ~16:9 proportions) for future backdrop updates — no code changes needed.

### `src/assets/art/ai-cloche.svg`
- **What**: Silver serving cloche on a plate with a big "?" — the mystery-dish icon.
- **Where**: "Special of the day" hint line at the top of the menu card.
- **Size**: 240×200 viewBox, displayed ~54×45px (keep it readable small).

### `public/og-image.jpg`
- **What**: The social card — the vintage diner photograph under a one-line neon "Lunch
  Special" wordmark, the "THE DAILY DISH GUESSING GAME" tagline, a mustard
  "★ GUESS TODAY'S SPECIAL ★" line, and the URL.
- **Where**: `og:image` / `twitter:image` in `index.html`, so it is what Twitter, Facebook,
  Discord unfurls, Slack and iMessage show for a pasted link. **Also the source of the
  Discord cover art and the press-kit key art** (see both tables below) — one picture, so a
  shared link and the Activity Shelf look like the same product.
- **Size**: 1200×630 (1.90:1, the standard OG card ratio). The type runs nearly edge to
  edge — the wordmark alone is 809px of the 1200 — so this crops badly to anything squarer.
  Re-cut it at the same ratio when swapping, and re-run `npm run assets -- press`.

### `public/favicon.svg`
- **What**: Simplified cloche on a cherry-red circle.
- **Where**: Browser tab icon.
- **Size**: 64×64 viewBox. Must read at 16×16.
- **Derived from it**: the installable-app icons below. Re-run `npm run assets -- icons` after
  changing this file, or the home-screen icon and the tab icon drift apart.

## App icons (`public/icon-*.png`, `public/apple-touch-icon.png`)

Generated from `public/favicon.svg` by `npm run assets -- icons`
([`scripts/build-assets.mjs`](scripts/build-assets.mjs)) and committed. Referenced by
`public/manifest.json` + `index.html`.

| File | Purpose | Notes |
|---|---|---|
| `public/icon-192.png` | manifest `any` | Mark edge to edge, transparent corners |
| `public/icon-512.png` | manifest `any` | Install prompt / task switcher |
| `public/icon-maskable-512.png` | manifest `maskable` | Mark inset to 60% on a teal field — Android crops up to 20% per edge |
| `public/apple-touch-icon.png` | iOS home screen | 180×180, same padded artwork; must stay opaque (iOS renders transparency black) |

## Discord Activity assets (`discord-assets/`)

Uploaded by hand to the Discord Developer Portal — not served by the Worker. All derived
from the art above (backdrop + cloche mark + the social card).

**Three of the four are the press kit's files**, not separate copies. They were byte-identical
to `public/press/key-art.png`, `backdrop.png` and `app-icon.png` and are now generated once,
by `npm run assets -- press`. A hand upload can come from any folder, so `discord-assets/`
holds only the preview video and its README.
See [`discord-assets/README.md`](discord-assets/README.md) for Portal upload locations.

| File | What | Spec |
|---|---|---|
| `public/press/app-icon.png` | Cloche mark on a cherry radial ground | 1024×1024, circular safe zone |
| `public/press/key-art.png` | The social card, fitted to 16:9 — Activity Shelf hero | 1280×720 (16:9, crops to 13:11) |
| `public/press/backdrop.png` | Diner backdrop cropped to 16:9 — Grid-view backdrop | 1280×720 |
| `discord-assets/preview.mp4` | Slow zoom over the cover (optional hover preview) | 640×360, <1 MB, 9s |
| `src/assets/art/app-icon.svg` | Vector source for the icon | 1024 viewBox |

The cover art **is `public/og-image.jpg`**, not a separate composition. It used to be the
backdrop plus a two-line Yellowtail wordmark drawn in SVG by `build.mjs`; using the social
card instead means a pasted link and the Activity Shelf show the same picture, and it is
the better design of the two (one-line wordmark, star line, URL). The builder fits it to
**width** — 1280×672 — and extends 24px of replicated edge pixels top and bottom to reach
720, so nothing in the composition is cropped and the added band is invisible against the
flat ceiling and the vignette. **Known cost:** Discord also crops the cover to 13:11 (the
centered 851px), and the one-line wordmark is 863px wide, so that crop clips the `L` swash
and the tail of `Special`. The 16:9 hero is the placement that matters and it is whole;
fixing the square crop would mean redrawing the type smaller, i.e. no longer shipping the
og-image.

## Ad key art (`marketing/`)

The key art at every aspect ratio an ad platform asks for, generated with
`npm run assets -- keyart` ([`scripts/build-assets.mjs`](scripts/build-assets.mjs)).
**Not served by the Worker and not in the bundle** — upload-by-hand campaign
assets, which is why they aren't in `public/press/` (that ships on every deploy).
See [`marketing/README.md`](marketing/README.md) for the full reasoning.

| File | Spec | Where it goes |
|---|---|---|
| `marketing/keyart-1.91x1.jpg` | 1200×628 | Reddit + Meta link ads |
| `marketing/keyart-16x9.jpg` | 1280×720 | X, LinkedIn, YouTube |
| `marketing/keyart-4x3.jpg` | 1200×900 | older feed placements |
| `marketing/keyart-1x1.jpg` | 1080×1080 | square feed |
| `marketing/keyart-4x5.jpg` | 1080×1350 | Meta feed |
| `marketing/keyart-9x16.jpg` | 1080×1920 | Stories / Reels |

These are **composed, not cropped**. og-image.jpg can't be reframed — its type
runs nearly edge to edge — so the builder rebuilds the card from the untyped
backdrop plus vector type at each ratio, matching og-image's crop bias (0.33),
its grade (fitted to 6.1/255 mean error) and its neon bloom (halo-to-core 1.28
against the real 1.36). Two traps are documented in that README and worth reading
before touching the rendering: **`feDropShadow` silently doesn't render** through
sharp's librsvg, and **Alfa Slab One has no `★`**.

## Press kit (`public/press/`)

Served by the Worker at `/press` ([`public/press.html`](public/press.html)) — these ship on
every deploy, so keep the folder lean. Everything but the fonts is **generated** by
`npm run assets -- press` ([`scripts/build-assets.mjs`](scripts/build-assets.mjs)). The loose
files were hand-copied before that, which is how the press app icon spent a month rendering
its `?` in a different face from the Discord one.

**This folder is also the Discord Activity's art** — the same three PNGs, uploaded by hand
to the Portal. They used to be built twice under two sets of names, byte-identical, 3.6 MB
of it. The press page already labelled the single copies with their Discord roles.

**Each image comes out twice: a PNG the page offers as a download, and a JPEG the page
itself loads.** Both sources are photographic (`diner-backdrop.png` is a JPEG despite the
extension), so PNG buys nothing but bytes on a page view — the backdrop is the hero's CSS
background and was costing 2.2 MB of PNG-encoded JPEG artefacts against 172 KB.

There is **no press-kit zip**. It was 4.5 MB on every deploy re-packing files the page
already links one by one, plus a hand-rolled ZIP writer to maintain.

| File | What | Spec |
|---|---|---|
| `public/press/app-icon.png` | Cloche mark on cherry ground | 1024×1024 |
| `public/press/key-art.png` + `.jpg` | The social card, fitted to 16:9 (= Discord cover art) | 1280×720 |
| `public/press/backdrop.png` + `.jpg` | Diner backdrop (= Discord embedded background) | 1280×720 |
| `public/press/fonts/*.ttf` | Alfa Slab One + Yellowtail, for press use | OFL 1.1 |

The mark is **not** copied here — `/favicon.svg` is already served unhashed at a stable URL,
so the press page links that one.

## Fonts (licensed, not placeholders)

| File | Family | License | Use |
|---|---|---|---|
| `src/assets/fonts/alfa-slab-one.woff2` (+ `.ttf` source) | Alfa Slab One | SIL OFL 1.1 | Display headings, menu titles, buttons |
| `src/assets/fonts/yellowtail.woff2` (+ `.ttf` source) | Yellowtail | SIL OFL 1.1 | Neon script logo "Lunch Special" |
| `docs/fonts/bitter.woff2` | Bitter (variable 400–700, latin subset) | SIL OFL 1.1 | Headings on the GitHub Pages breakdown only |

Bitter lives in **one** place and stays there — it is not part of the game bundle or the
press kit. It exists because Alfa Slab One is unreadable in a run of words at heading
size; Bitter is the same Clarendon genre drawn for screens, so the breakdown page keeps
the diner register without the blockiness. The game itself still heads everything in Alfa
Slab One, where the strings are short enough to carry it.

**The game ships the `.woff2` pair and nothing else** (56 KB against the TTFs' 152 KB,
which weighed more than the game's JavaScript). `base.css` references only the WOFF2s, so
Vite bundles only those; the `.ttf` files beside them are the *source* the press copies
are made from and are never served by the game. They were converted once with
`wawoff2` (lossless repackaging, same glyphs, same OFL) and committed; if a face is ever
replaced, convert the new TTF the same way rather than pointing `base.css` back at it.

The same two `.ttf` files exist in three places, and that is **intentional** — each copy
serves a different host or consumer, so don't "dedupe" them: `src/assets/fonts/` is the
source (and, as WOFF2, the game bundle), `public/press/fonts/` are stable-URL press
downloads (kept as TTF because that is what somebody installs), and `docs/fonts/` belongs
to the GitHub Pages project-breakdown site (a separate host that can't reach Vite's hashed
filenames). Collapsing them would trade a few hundred KB for a cross-origin dependency
between two deploys. `npm run assets -- press` copies the press pair from
`src/assets/fonts/`, so those two can no longer drift.

The neon logo is **live text** styled with CSS glow (`.marquee__script`), not an image — a hand-lettered SVG logo would be a welcome replacement (target: ~4:1 aspect, works from 320px wide).

## Audio (to be licensed — nothing shipped yet)

**No audio file exists in this repo.** The system that plays them does, and it is
built so that dropping licensed files into `src/assets/sfx/` and
`src/assets/music/` under the names below is the *entire* installation step —
there is no flag, no registration and no code change. A name with no file is a
sound the game doesn't make; everything else carries on. See the READMEs in both
directories for the filename lists, and CLAUDE.md for how the engine works.

Unlike the art, these are being **bought**, so the provenance table at the bottom
of this section is not optional bookkeeping — it is the only record of what we're
allowed to do with each file.

### What to require of the sound effects

| Property | Requirement | Why |
|---|---|---|
| Master format | **48 kHz, 24-bit WAV, mono** | 48 kHz is what the browser's `AudioContext` runs at (verified: `sampleRate: 48000`), so nothing gets resampled on decode. Mono because the game has no spatial field. |
| **Leading silence** | **None. Trimmed hard to the transient.** | The single biggest factor in whether the game feels snappy. Head silence is latency you cannot recover in code — a 40 ms pad makes a click feel mushy forever. |
| Length | UI one-shots ≤ 250 ms; feedback ≤ 600 ms; the win sting ≤ 1.5 s | The guess arc fires four flips inside 400 ms; anything longer overlaps the next event. |
| Tail | Dry. No long reverb. | Reverb tails turn the tile-flip run into mud. |
| Level | Peak-normalised to **−1.0 dBTP** | Balance between sounds is set in code (`gain` in `shared/audio.ts`), *not* in the files. Don't ask the licensor to mix them against each other. |
| Fades | No fade-in. Micro fade-out (≤ 5 ms) to kill clicks. | |

**Ship WAV for one-shots** unless the pack gets large (~18 sounds at 300 ms mono
48k/16-bit ≈ 500 KB, which is fine). AAC and MP3 encoders bake in 1024–2112
samples of encoder delay — 21–44 ms — and `decodeAudioData` does not reliably
honour the gapless metadata that would strip it, so that silence lands directly
on the front of every sound. That is the exact defect the "no leading silence"
row exists to prevent, reintroduced by the codec.

### What to require of the ambient bed

| Property | Requirement | Why |
|---|---|---|
| Master | 48 kHz, 24-bit WAV, stereo | |
| **Loop** | **Seamless, with the loop points stated** | Most stock tracks sold as "loops" are not. Audition the wrap before buying. If the trim is imperfect, `MUSIC.loopStart`/`loopEnd` in `shared/audio.ts` take up the slack without re-encoding. |
| Length | **45–90 s** | It is decoded to a Float32 buffer: 60 s stereo at 48 kHz is ~23 MB resident on the player's device. |
| Mix | Restrained, **−20 to −18 LUFS integrated** | A bed under the effects, not a second foreground voice. The bus gain is also held low (`MUSIC.gain`), but a track mastered to −9 will fight the effects regardless. |
| Mono compatibility | Must not collapse | Most plays are a phone speaker. |
| Content | No sharp transients, no vocal | Anything percussive in the bed gets mistaken for game feedback. |

**Ship format:** AAC `.m4a` at 96–128 kbps stereo (encoder delay doesn't matter
for a bed the way it does for a one-shot).

### Budget

**Total audio ≤ 1.5 MB, of which the bed ≤ 1 MB.** For scale, the two font files
and the backdrop PNG are currently the heaviest things the game ships. The
effects load during idle time; the bed is not fetched at all until the player's
first interaction, so a visitor who bounces pays nothing for it.

### Licence provenance

Fill one row per file as it is bought. This table is the record of what each file
permits — keep it current, and keep the receipt.

| File | Source | Licence | Attribution required? | Acquired |
|---|---|---|---|---|
| _(none yet)_ | | | | |

## Non-art visuals built in CSS (no files)

- Menu card paper, red double-rule border (`.menu-card`)
- Clue "order tickets" with red header bar (`.ticket`)
- Receipt-style result modal (`.modal--receipt`)
- Attribute tiles and ingredient chips (hit/near/miss colors)

These can stay CSS or be given illustrated treatments later — they're listed so an artist knows the full visual surface.
