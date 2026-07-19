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

## Fonts (licensed, not placeholders)

| File | Family | License | Use |
|---|---|---|---|
| `src/assets/fonts/alfa-slab-one.ttf` | Alfa Slab One | SIL OFL 1.1 | Display headings, menu titles, buttons |
| `src/assets/fonts/yellowtail.ttf` | Yellowtail | SIL OFL 1.1 | Neon script logo "Lunch Special" |

The neon logo is **live text** styled with CSS glow (`.marquee__script`), not an image — a hand-lettered SVG logo would be a welcome replacement (target: ~4:1 aspect, works from 320px wide).

## Non-art visuals built in CSS (no files)

- Menu card paper, red double-rule border (`.menu-card`)
- Clue "order tickets" with red header bar (`.ticket`)
- Receipt-style result modal (`.modal--receipt`)
- Attribute tiles and ingredient chips (hit/near/miss colors)

These can stay CSS or be given illustrated treatments later — they're listed so an artist knows the full visual surface.
