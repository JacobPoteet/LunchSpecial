---
paths:
  - "shared/kidsmenu.ts"
  - "shared/crayon.ts"
  - "worker/kidsmenu.ts"
  - "worker/routes/kidsmenu.ts"
  - "src/game/KidsMenu.tsx"
  - "src/game/GuessInput.tsx"
  - "src/admin/KidsMenuPanel.tsx"
---

# Kids' Menu

Loaded with the files above. Rules that apply everywhere stay in the root CLAUDE.md.

An opt-in short list of the dishes that still fit, from the fourth miss (`MENU_AFTER`). Rules in `shared/kidsmenu.ts`; Worker in `worker/kidsmenu.ts` + `routes/kidsmenu.ts`; card in `src/game/KidsMenu.tsx`.

- **The pill sits beside the order bar and never opens the card.** It is the field's height, in the slot the Order button left (`GuessInput`'s `trail`), drawn on paper in crayon red, never the cherry fill (a filled button there reads as "submit"). It renders only while the menu can open; otherwise the field takes the whole row. Fresh, it enters only after the clue ticket has fed out: its slot opens (a `0fr`→`1fr` grid column, gap inside it, no padding) and the field draws back to uncover it; the tip's space then opens the same way, then the ring. Never a fade-in into a slot already reserved. One pill, every layout, Discord PIP included (the toolbar copy and the PIP copy are gone: players never looked up at the toolbar by the fourth miss). The bar passes no `trail`. One coach card per device, the first round it could open: it rides as the order bar's `lead`, caret pointing down at the pill, and the pill rings while it is up (`lunch-special:kids-menu-tip-seen`, in `PROGRESS_KEYS`; renamed from `kids-menu-seen` so every device sees the new spot once); never shown to a showcase. Never call it a cheat on screen.
- **The card is a list: circle one, order it.** No peeks, no crossing out, no scratchpad (tried in the first pass and cut). A guessed dish prints crossed out, on the rare board it still fits.
- **Every tile result filters, hits and misses** (`fitsBoard`): country hit keeps that country, near keeps the region minus the guess's country, miss drops the guess's region; course, temperature and protein keep a hit and drop a miss. **No floor**: the menu is every dish that fits, down to the Special alone. **Ingredients never filter** (matched, missed and the printed count solve the round). The Worker reads the board from the guessed dish ids against its own target, never from client claims; the target joins the pool when inactive. Stamps print confirmed facts only (`confirmedFacts`), under a "Confirmed" label, and not at all on a board of misses. Nothing about order may hint: names alphabetical, sections in `COURSES` / `REGIONS` order (`layoutMenu`).
- **Every dish is always on show.** Course headings are plain headings, dropped when one course is left; **never a fold** (a folded section left a card with nothing to order). The line under the title (`menuBlurb`) is one short sentence: how many dishes could still be the answer.
- **An order off the card is an ordinary guess.** A win is a full win and keeps the streak. **Leave no trace**: share text, grid, check and stats never mention it. No Kids' Menu at After Dark; no post-loss menu view.
- Analytics: `analytics_rounds.kids_menu_at` (stamped by the menu route, first open only) and `analytics_guesses.from_kids_menu` (0/1, NULL pre-0062 and on drinks). The "reached a fourth miss" cohort is derived, never stored. `kids_menu_opens` (0077) holds the card's size, one row per (round, board), written by the menu route only for a round with an `analytics_rounds` row; none before 0077 is unmeasured. The size a card *would* have printed is rebuilt at read time from the ledger (`rebuiltSize`), never stamped on `/guess`; the readout compares opened vs didn't only within a size group, and wins off the card against a blind pick (min(1, k/N)). Activity tags such rounds; Menu tab has a folded readout; Experiments has `fourthMissReturn`.
- The crayon ring goes round the whole entry (name and country) and is drawn at its measured size by `shared/crayon.ts`, one hand per dish, always a full turn plus a tail, and an oval (only the longest names square up, as little as fits; `crayon.test.ts` pins it). Never a fixed viewBox stretched under `vector-effect: non-scaling-stroke`: the draw-on dash is then measured on screen and a long name gets a part ring.
- Motion is a second pass: every moment is a data attribute (`data-kids`, `data-row`, `data-moment`), timings in `KIDS_MENU_MS` (`shared/audio.ts`) mirroring the `--kids-*` dial in game.css.
