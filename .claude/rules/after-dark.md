---
paths:
  - "shared/night.ts"
  - "shared/share.ts"
  - "shared/clues.ts"
  - "src/game/NightPage.tsx"
  - "src/game/night.ts"
  - "worker/nightcap.ts"
  - "worker/routes/nightcap.ts"
  - "worker/drinkdb.ts"
  - "worker/showcase.ts"
  - "worker/auth.ts"
  - "src/main.tsx"
  - "src/admin/BarView.tsx"
  - "worker/routes/admin/bar.ts"
  - "src/styles/**"
---

# After Dark

Loaded with the files above. Rules that apply everywhere stay in the root CLAUDE.md.

A second daily puzzle: one **drink** a night, **4 guesses**, **3 coasters**, between 20:00 and 03:00 on the player's own clock. Vocabulary: *Nightcap* (Night #N), *coaster*, *tab* (the bar's check), *Libations* (card heading). "After Dark" names the marquee and nothing else.

**Clock**
- `shared/night.ts` is the only place that decides when the bar is open or which night a round belongs to. Every fold takes the clock as an argument.
- The night key is the local calendar day the evening began on (00:00–02:59 belongs to the night before). **Fixed at entry, never recomputed.**
- Last call is a door, not a timer: a live round runs to completion. `graceNight` gives a reload one hour past close, only for an unfinished round with a guess on it.
- The Worker doesn't know local time: `isPlayableNight` accepts ±1 day of ET's.
- `NIGHT_EPOCH_DATE` must be on or before ship day; a future epoch closes the bar completely.
- `lunchAdmits` accepts the ET day's Special **or** the one dated on the night key (ET midnight falls inside a night west of ET). A Nightcap in progress is admitted before the fold is asked.

**Door and invite**
- Gated on finishing today's Special; say why on the closed sign. `soon` is a sentence, not a disabled button. **Nothing happens until the band is pressed**; no auto-navigation.
- The invite is its own band at the foot of the check, never a button in the replay row (the check is the tallest card at 375px; on a daily the replay row scrolls with the body so the pinned footer stays near 150px), fades in a beat after the check settles, and turns on live (`useBarInvite` polls; **never capture the night or settled state at mount**). Flare lights edges, never fill (contrast). A toolbar pill covers returning players.

**Data model**
- `drinks` / `drink_clues` / `drink_schedule` are their own tables, never a `kind` column on `dishes` (about ten queries read the dish pool unfiltered).
- Tiles: **country · spirit · temperature · profile**; country keeps near-match, the rest hit/miss. `spirit: 'none'` is a value. `is_alcoholic` is stored, never derived. Pool held between 55% and 80% alcoholic by `worker/data-integrity.test.ts`.
- Ingredient vocabulary is pooled with the kitchen's. `dish_requests.kind` is a column (an inbox, unlike a catalogue).
- Coaster sheet: 1 **First impression** (one angle: glass, ritual, look, hour; never the country, a region only with a second fact), 2 **The pour** (who, what goes in; may run two sentences; a year is one lens), 3 **Last call** (country placed naturally, appearance). Variety ratchets and an all-pairs no-repeat check live in `worker/data-integrity.test.ts`; `scripts/patch-clues.mjs --drinks` backfills `drink_clues` by slug. Names/budgets live once in `shared/clues.ts` (`COASTER_BEATS`). All dish beat-sheet hard rules apply; `lintClue` takes the sheet rather than being forked. The tab lists all three clues (`StoryDetails`).

**Sharing:** the tab shares the night grid plus the lunch grid. Night tiles use `⬛` for a miss, `🥃` pantry, `🥂` winning pour. A combined share fires the *nightcap* round's beacon only. `shareMessage` appends the url once to the whole message; grid folds are url-free (`shared/share.ts`). `RoundState.ingredientCount` is stamped on every lunch round so the grid redraws from storage.

**Theme:** `<html data-after-dark>`; `base.css` redefines tokens under `:root[data-after-dark]`. Attribute-scoped, never a media query.
- Measure contrast on the **painted** surface, not the token. A theme can't swap what a rule hardcodes: use `--paper-sheen`, `--paper-stipple`, `--row-fill`.
- `--hit` stays at the daytime value. `--paper-edge` must be lighter than what it sits on. Text on `--mustard` is `--on-near`, never `--ink`. Hover fill is `--cherry-hover`, never `--cherry-dark`. Never paint a one-off hex where a token belongs.
- `npm run a11y` scans three bar states; run it after any night-palette change.

**Testing the bar:** `npm run lastcall` is the real flow. `?barhours=off` bypasses the clock only (not the finish-lunch gate); `?nightcap=<slug>` pins the pour; `?nightcap=random` is resolved client-side so the Worker never learns a random branch. All dev-only. In production only a signed token gets past the clock, untracked: `preview:drink:<id>` (24h, lands on `/?bar=1&preview=…`) or the showcase link. Logic in `worker/showcase.ts`.

**Showcase link** (`/?s=<token>`): opens a finished, won Special with the band lit, for someone who has never played.
- Seeded before React mounts (`applyShowcase` in `src/main.tsx`); written to a module variable, **never localStorage**; untracked. `isShowcase` is deliberately separate from `isPreview`. The clock override is cosmetic and client-side; the signature does the gating. The toolbar pill rides along (`(tracked || isShowcase) && dailyDone`). `leaveBar` hard-assigns `/`, dropping the token.
- **Cannot be revoked** (stateless HMAC; rotating `SESSION_SECRET` kills every session and preview). Lifetimes are a closed set (`SHOWCASE_TTL_DAYS`); the mint route 400s rather than clamping.
- Token format changes in `worker/auth.ts` (128-bit truncated signature, base36 expiry) are shared by every token and invalidate all live ones. Payload is `sc`, no colon; `classifyDrinkPreview` matches it exactly. Don't build a D1 short-code table.
