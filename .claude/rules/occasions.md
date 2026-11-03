---
paths:
  - "shared/occasions.ts"
  - "src/occasions/**"
  - "worker/occasions.ts"
  - "worker/routes/admin/occasions.ts"
  - "src/admin/OccasionsView.tsx"
---

# Occasions

Loaded with the files above. Rules that apply everywhere stay in the root CLAUDE.md.

A costume the game wears for a stretch of the calendar (Halloween first). **Handcrafted in code; /admin only decides when.** Never call it an "event" in a URL, path or table (ad blockers; `conventions.test.ts`).

- `shared/occasions.ts` is the only place that decides which occasion a day wears (`occasionOn`): the live booking covering it. **No booking, no costume.** `OCCASION_IDS` is a closed set; `OCCASIONS[id].suggested` only prefills the form and flags an unbooked season. Never `INSERT INTO occasion_bookings` from a migration or the seed.
- **Booked like a notice:** one row per run, both ends inclusive, Live outranks the dates. Live bookings never overlap (`findOverlap`, the Worker 409s), so one booking is one run and owns its numbers.
- **The day is the round's own, fixed at entry:** the puzzle date for lunch (a Leftover from Oct 31 replays in costume), the night key at the bar. Pages call `useWearOccasion(day)`; everything else reads `useOccasion()`. `primeOccasion()` dresses the page before mount (capped wait).
- `?occasion=<id>|none` is cosmetic and honoured in production on purpose. The Worker stamps `analytics_rounds.occasion` on insert from `play_date` and never reads the param.
- **A costume is `src/occasions/<id>/`**, a lazy chunk that fills the slots in `src/occasions/kit.ts`. A new slot is a deliberate change to `kit.ts` and the page that mounts it. CSS scoped to `:root[data-occasion="<id>"]`; anything that must show off-season (the Leftovers calendar mark) lives in game.css.
- **Decoration only:** `aria-hidden`, never under text, never recolours text or a fill text sits on. The one pressable slot (Cloche) is a real button with a label and announces its result.
- **Lights loop, the way the bar band's halo does:** no flash faster than 3/s (2.3.1), never over text, and every keyframe in the costume's own reduced-motion block, same commit. Looping past 5s with no pause control is a known WCAG 2.2.2 gap; reduced motion is the off switch.
- **A costume's palette is a token swap** scoped `:root[data-occasion="<id>"]:not([data-after-dark])` (an unscoped one ties with After Dark and repaints the bar). `--hit`/`--near`/`--miss` never move. Measure on the painted surface and add an a11y state for every screen the swap reaches.
- Share: `shareMessage(text, t, occasion)` adds the occasion's line (`t.occasions[id].shareLine`) between grid and url; the grid is untouched. A costume's words (`copy`) are catalog entries too. Score card corner art is a pixel map, never emoji. Neither names the dish.
- Sounds: `OCCASION_SFX` in `shared/audio.ts`, files under `src/assets/sfx/occasions/<id>/`. Missing file = everyday sound.
- `npm run a11y` scans each room in costume; add states for a new occasion.
- **Reach (`occasion_views`, `POST /api/occasions/seen`):** one row per (occasion, device, ET seen_day, room, moment); moments `seen` and `knock`. The client sends only from a tracked round, never under `?occasion=` or before the bookings come back from the Worker (`noteOccasionMoment`); the Worker re-runs the fold on `play_day` and 400s a costume that day didn't wear. Runs are attributed by `play_day`, so a Leftover replayed later counts as "after", not as reach. Reach before the ledger's first row is unmeasured (`measuredFrom: null`), never zero.
- **Events page** (admin nav "Events", view `occasions`) works like Announcements: cards grouped On now / Booked / Ran / Pulled, "+ New event", an editor, Delete with a confirm. `GET /api/admin/occasions` returns each booking with its reach (the notices' strip on the card) and impact (folded: room, returned, knocked, after; same weekdays before via `baselineFor`, lunch and Nightcap apart, pooled rates, `shareVerdict`, first-time players). Schedule keeps only the dashed-ink day tags; Trends keeps the costume bands (annotations, dashed ink, never a fifth colour).
