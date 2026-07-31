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

### `public/favicon.svg`
- **What**: Simplified cloche on a cherry-red circle.
- **Where**: Browser tab icon.
- **Size**: 64×64 viewBox. Must read at 16×16.
- **Derived from it**: the installable-app icons below. Re-run `npm run assets:icons` after
  changing this file, or the home-screen icon and the tab icon drift apart.

## App icons (`public/icon-*.png`, `public/apple-touch-icon.png`)

Generated from `public/favicon.svg` by `npm run assets:icons`
([`scripts/build-icons.mjs`](scripts/build-icons.mjs)) and committed. Referenced by
`public/manifest.json` + `index.html`.

| File | Purpose | Notes |
|---|---|---|
| `public/icon-192.png` | manifest `any` | Mark edge to edge, transparent corners |
| `public/icon-512.png` | manifest `any` | Install prompt / task switcher |
| `public/icon-maskable-512.png` | manifest `maskable` | Mark inset to 60% on a teal field — Android crops up to 20% per edge |
| `public/apple-touch-icon.png` | iOS home screen | 180×180, same padded artwork; must stay opaque (iOS renders transparency black) |

## Discord Activity assets (`discord-assets/`)

Uploaded by hand to the Discord Developer Portal — not served by the Worker. All derived
from the art above (backdrop + cloche mark + fonts); regenerate with `npm run assets:discord`.
See [`discord-assets/README.md`](discord-assets/README.md) for Portal upload locations.

| File | What | Spec |
|---|---|---|
| `discord-assets/app-icon.png` | Cloche mark on a cherry radial ground (from favicon) | 1024×1024, circular safe zone |
| `discord-assets/cover-art.png` | Backdrop + neon "Lunch Special" wordmark — Activity Shelf hero | 1280×720 (16:9, crops to 13:11) |
| `discord-assets/embedded-background.png` | Diner backdrop cropped to 16:9 — Grid-view backdrop | 1280×720 |
| `discord-assets/preview.mp4` | Slow zoom over the cover (optional hover preview) | 640×360, <1 MB, 9s |
| `discord-assets/app-icon.svg` | Vector source for the icon | 1024 viewBox |

## Press kit (`public/press/`)

Served by the Worker at `/press` ([`public/press.html`](public/press.html)) — unlike the
Discord assets, these ship on every deploy, so keep the folder lean. The loose files are
the individual downloads the page links; `lunch-special-press-kit.zip` is the "grab
everything" bundle, **generated** from them with `npm run assets:press`
([`scripts/build-press-kit.mjs`](scripts/build-press-kit.mjs)) — don't hand-roll it.

The zip deliberately ships **one copy per image**. `discord-assets/cover-art.png` and
`embedded-background.png` are byte-identical to `key-art.png` and `backdrop.png`; the
press page already labels the single copies with their Discord roles, so carrying both
names just doubled 4.4 MB on every deploy. The builder also writes forward-slash paths —
the previous PowerShell-built zip used backslashes, which macOS/Linux extractors turn
into a literal `fonts\alfa-slab-one.ttf` file instead of a `fonts/` directory.

| File | What | Spec |
|---|---|---|
| `public/press/app-icon.png` | Cloche mark on cherry ground | 1024×1024 |
| `public/press/key-art.png` | Backdrop + neon wordmark (= Discord cover art) | 1280×720 |
| `public/press/backdrop.png` | Diner backdrop (= Discord embedded background) | 1280×720 |
| `public/press/favicon.svg` | Cloche mark | 64×64 viewBox |
| `public/press/fonts/*.ttf` | Alfa Slab One + Yellowtail, for press use | OFL 1.1 |

## Fonts (licensed, not placeholders)

| File | Family | License | Use |
|---|---|---|---|
| `src/assets/fonts/alfa-slab-one.ttf` | Alfa Slab One | SIL OFL 1.1 | Display headings, menu titles, buttons |
| `src/assets/fonts/yellowtail.ttf` | Yellowtail | SIL OFL 1.1 | Neon script logo "Lunch Special" |
| `docs/fonts/bitter.woff2` | Bitter (variable 400–700, latin subset) | SIL OFL 1.1 | Headings on the GitHub Pages breakdown only |

Bitter lives in **one** place and stays there — it is not part of the game bundle or the
press kit. It exists because Alfa Slab One is unreadable in a run of words at heading
size; Bitter is the same Clarendon genre drawn for screens, so the breakdown page keeps
the diner register without the blockiness. The game itself still heads everything in Alfa
Slab One, where the strings are short enough to carry it.

The same two `.ttf` files exist in four places, and that is **intentional** — each copy
serves a different host or consumer, so don't "dedupe" them: `src/assets/fonts/` is the
game bundle (Vite content-hashes these), `public/press/fonts/` are stable-URL press
downloads, `docs/fonts/` belongs to the GitHub Pages project-breakdown site (a separate
host that can't reach Vite's hashed filenames), and the press-kit zip carries its own.
Collapsing them would trade 152 KB for a cross-origin dependency between two deploys.

The neon logo is **live text** styled with CSS glow (`.marquee__script`), not an image — a hand-lettered SVG logo would be a welcome replacement (target: ~4:1 aspect, works from 320px wide).

## Non-art visuals built in CSS (no files)

- Menu card paper, red double-rule border (`.menu-card`)
- Clue "order tickets" with red header bar (`.ticket`)
- Receipt-style result modal (`.modal--receipt`)
- Attribute tiles and ingredient chips (hit/near/miss colors)

These can stay CSS or be given illustrated treatments later — they're listed so an artist knows the full visual surface.
