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

### `src/assets/art/ai-diner-scene.svg`
- **What**: The full diner-interior backdrop — teal wall with chrome trim, red band, checkerboard floor, picture window (night sky, neon coffee-cup sign, blinds), "TODAY'S SPECIAL ???" menu board, two pendant lamps, chrome-edged counter with props (coffee pot, pie stand, ketchup/mustard, napkin holder, milkshake), three red-topped chrome stools.
- **Where**: CSS `background-image` of the entire game screen (`.scene`), behind the menu card.
- **Size**: 1600×900 viewBox, rendered `cover` at any viewport; on phones roughly the center-left 40% is visible (`background-position: 62% 30%`), so keep interest away from the extreme edges.
- **Notes**: Groups are labeled (`#window`, `#menu-board`, `#lamps`, `#counter`, `#props`, `#stools`) so pieces can be redrawn individually. Must stay dark/mid-tone enough for the cream menu card to pop.

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
