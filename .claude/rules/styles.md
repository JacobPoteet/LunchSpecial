---
paths:
  - "src/styles/**"
  - "src/**/*.css"
  - "src/game/**"
  - "src/occasions/**"
  - "src/discord/**"
  - "src/admin/**"
---

# Styling

- **No emoji in the game's chrome**; draw `Icon` (`src/game/Icon.tsx`, add a path to `PATHS`). Share text keeps emoji.
- **Spacing, radius, layer, speed, border width and shadow are tokens** in `base.css` (`--space-N` named by pixels, `--radius-*`, `--z-*`, `--dur-fast|base`, `--border-hair|thin|medium|thick`, named `--shadow-*`). Glows, washes and shadows with an alpha take a channel token: `rgb(var(--teal-rgb) / 0.12)`, never a bare `rgba(27, 79, 74, …)`. `conventions.test.ts` fails on a raw on-scale px in padding, margin or gap, a raw 1/1.5/2/3px border width, or an `rgba` of a named channel. Use them in new rules. Animation timing stays literal (mirrored in `shared/audio.ts`). The dashboard's ordered ramp is `--rank-1`…`--rank-8`, and its tints `--teal-wash`, `--teal-wash-hover`, `--mustard-wash`. The design system artifact mirrors `base.css`; edit the CSS first.
- **Press areas are 44px, drawn smaller if they need to be.** Pills and round icon buttons are 36px with a 4px `::after` reach and an 8px gap so reaches never overlap; a new small control takes the same pseudo-element rather than a taller drawing. **Attribute tiles are a content-weighted flex row, never equal columns**: "Vegetarian" and "United States" overflow a quarter of a 375px row. Two by two under 340px. Check a new tile or chip layout at 320, 360, 375, 390 and 430 with the widest country, course and protein together.
- **Three faces:** Alfa Slab One (sign, 1rem and up only), Yellowtail (neon/flourish), League Gothic `--font-gothic` (tabs, labels, small print). Fonts ship as `.woff2` only. Paper surfaces take `--radius-paper`, controls `--radius`. One job per face: Alfa Slab = headings and big numbers, Gothic = labels, Georgia = reading text and controls; Yellowtail = the neon title only. Sizes come from the `--fs-xs`…`--fs-xxl` scale in `base.css`; no raw rem or px font sizes in `admin.css`, nothing under `--fs-xs`.
