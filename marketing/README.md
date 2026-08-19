# Ad key art

The Lunch Special key art at every aspect ratio an ad platform asks for.
Generated — don't hand-edit, don't crop by hand:

```bash
npm run assets:keyart     # → keyart-*.jpg
```

**Not served by the Worker and not in the app bundle.** These are upload-by-hand
campaign assets, which is why they live here rather than in `public/press/` —
that folder ships on every deploy, and 1.4 MB of ad sizes has no business
being downloadable by players.

| File | Size | Where it goes |
|---|---|---|
| `keyart-1.91x1.jpg` | 1200×628 | Reddit and Meta link ads |
| `keyart-16x9.jpg` | 1280×720 | X, LinkedIn, YouTube |
| `keyart-4x3.jpg` | 1200×900 | older feed placements |
| `keyart-1x1.jpg` | 1080×1080 | square feed |
| `keyart-4x5.jpg` | 1080×1350 | Meta feed — the tallest non-story slot |
| `keyart-9x16.jpg` | 1080×1920 | Stories, Reels |

## Why these are composed and not cropped

`public/og-image.jpg` is the finished card, and it cannot be reframed: its type
runs nearly edge to edge — the wordmark alone is 809 of its 1200px — so cropping
to anything squarer cuts the lettering, and fitting it to a taller canvas
letterboxes the picture.

So [`scripts/build-keyart.mjs`](../scripts/build-keyart.mjs) rebuilds the card
from its parts at each ratio: the clean, untyped `src/assets/art/diner-backdrop.png`,
the grade og-image applies to it, and the type re-rendered as vector at output
resolution. **The type being vector is what makes the tall sizes work at all** —
the backdrop is only 1024×689, so 9:16 upscales it 2.79×, and the piece still
reads sharp because the eye judges sharpness on the lettering.

Three parts of that were measured against `public/og-image.jpg` rather than
eyeballed, and the script carries the numbers so they can be re-derived:

- **The crop bias.** og-image takes its 628 rows starting 59px into an 807px
  frame — 0.33, not the 0.5 a centre crop gives. That holds the ceiling lights
  and the neon and trims floor instead.
- **The grade.** Grid-searched over saturation, brightness, vignette and teal
  scrim, scored outside the type area: mean abs error 6.1/255 per channel,
  against 32.7 for the ungraded backdrop.
- **The neon bloom.** Counted as pink halo pixels against core ink pixels.
  og-image sits at 36711/27005; this lands 36923/28745.

## Two traps, if you touch the rendering

**`feDropShadow` does not work here.** The bloom was originally three stacked
drop shadows, the same construction `discord-assets/build.mjs` used; librsvg
drops nearly all of it through sharp, measuring 0.19 halo-to-core against the
real card's 1.36. The glow is built with sharp's own blur instead, and each
layer is drawn on **black and screened** rather than left transparent — blurring
a thin script stroke by a wide radius spreads its alpha until the peak is
nothing (that version measured 0.17). Screening against black is exact, and puts
the intensity in the colour where a gain can amplify it. It is also the right
blend physically: a tube adds light to what is behind it.

**Alfa Slab One has no `★` (U+2605)**, and the script's fontconfig deliberately
exposes only the repo's own fonts, so there is no fallback family and the
character renders as tofu. The stars flanking the star line are drawn as
polygons.

## Source art

Everything here derives from `src/assets/art/diner-backdrop.png` and the OFL
fonts in `src/assets/fonts/`. Same AI-placeholder status as the rest of
[`ASSETS.md`](../ASSETS.md) — swap the backdrop and re-run.
