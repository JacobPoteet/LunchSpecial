# CLAUDE.md — Lunch Special

Daily Wordle-style game: guess the diner's "Special" (a world dish). 1950s diner theme. One Cloudflare Worker serves everything: React SPA (Workers Static Assets) + Hono API + D1. No accounts; player state in localStorage.

**This file is rules, not documentation.** It carries what a change must not break and what the code can't tell you. How things work: read the code (pure folds in `shared/` and `worker/` each have a test beside them). Why they're shaped that way: the wiki (see "Documentation").

## Commands

```bash
npm run dev          # vite dev (Worker in workerd via @cloudflare/vite-plugin), http://localhost:5173
npm run play         # opens /play: a fresh round on a random dish, nothing saved (dev only)
npm run ramen        # same, pinned to one dish (/play?special=ramen)
npm run lastcall     # hand-off harness: seeds a finished, won Special so the After Dark band is live
npm run negroni      # a Nightcap on one named pour, opening hours ignored (?bar=1&nightcap=negroni)
npm run halloween    # the diner in its Halloween costume (?occasion=halloween; works on any URL, any build)
npm run admin        # opens /admin at the login
npm test             # vitest — worker/**/*.test.ts + shared/**/*.test.ts
npm run check        # tsc -b (3 project refs: app / worker / node)
npm run lint         # oxlint. rules-of-hooks is an error, exhaustive-deps a warning
npm run a11y         # axe over the RUNNING game (needs `npm run dev` in another terminal)
npm run build / preview / deploy
npm run db:migrate   # LOCAL D1 (db:migrate:remote for prod)
npm run db:seed      # LOCAL D1, bootstrap only
npm run db:export:remote    # dump PROD D1 → gitignored backups/. Take one before any prod DB work
npm run db:export:catalog   # dishes+clues+schedule only, no player data, safe to share
npm run cf-typegen   # regenerate worker-configuration.d.ts after wrangler.jsonc changes
npm run docs:web     # rebuild docs/ingredient-web.js (maintainer one-off, output committed)
npm run assets       # rebuild generated images (maintainer one-off, output committed; see ASSETS.md)
npm run discord:register    # one-time /progress command registration
npm run tunnel       # cloudflared quick tunnel → :5173, for testing inside real Discord
```

Local admin password: `ADMIN_PASSWORD` in `.dev.vars` (gitignored). Browser preview: `.claude/launch.json`, server `lunch-special`. TypeScript 7 has no JS API for typescript-eslint, which is why lint is oxlint.

## Deploy and data safety

**Live:** https://lunchspecial.app. Releases: `git tag vX.Y.Z && git push origin vX.Y.Z` runs `deploy.yml` (test + check + remote migrate + deploy). `ci.yml` (test, check, lint, a11y) and `codeql.yml` run on push/PR to `main`.

- **Prod D1 is the only copy of half the data.** `seed.sql` + `migrations/` rebuild the dish/drink *pool* only. `schedule`, `drink_schedule`, admin edits, analytics, requests, announcements, experiments and `sound_prefs` exist only in prod. Dashboard-vs-seed divergence is expected.
- **`npm run db:seed:remote` is destructive** (replaces every booked Special). Never run it against prod. No automatic backup exists: export first.
- **CI runs migrations (additive, idempotent), never the seed.**
- **Never add `INSERT INTO schedule` or `INSERT INTO drink_schedule`.** Booking happens in /admin; unbooked days run on the deterministic fallback pick.
- **Secrets** (`ADMIN_PASSWORD`, `SESSION_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_PUBLIC_KEY`, `GITHUB_TOKEN`): `wrangler secret put`, persist across deploys. Discord and GitHub ones are optional; unconfigured, the feature degrades and nothing else breaks. **A new Worker secret must be added to `.dev.vars.example`**, or CI's placeholder `.dev.vars` lacks it and `tsc` fails. `GITHUB_REPO` and `VITE_DISCORD_CLIENT_ID` are public (the latter is a build-time Vite var, in `.env.local`, not `.dev.vars`). `DISCORD_BOT_TOKEN` is used only by `discord:register`.
- `ci.yml` and `codeql.yml` share an identical `paths-ignore` (`**.md`, `docs/**`, `discord-assets/**`); keep them in sync. If CI becomes a required check, doc-only PRs will hang on it.
- `deploy.yml` re-runs test + check on purpose and checks out with `fetch-depth: 0` (the build marker needs tags).
- D1 id is in `wrangler.jsonc`; CI uses GitHub secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.

## Discord Activity

Runs as an embedded iframe with **no separate build**: Discord proxies `lunchspecial.app`. Client code is `src/discord/`, activated by the `frame_id` query param; off Discord the SDK is never downloaded.

- **The 5s `ready()` cap gates only the React mount.** `attachPresence`/`attachShare`/`attachSocial` run inside the handshake's own `.then()`, never on the race-winning branch.
- **Never name the dish** in presence copy or the score card. Progress and guess counts are safe; answer, guessed dishes and clues are not. A test pins this.
- **Two OAuth scopes, `identify` + `rpc.activities.write`, both required.** Don't add a third; don't re-run the experiment. The user object from `authenticate()` is dropped: never read, stored, sent or persisted.
- **Token exchange is server-side**; the client secret never reaches the browser. Unconfigured → 503, and nothing may wait on a Discord feature.
- **Authorize once per page load** (`prompt: "none"`); a refusal sets `unavailable`, never retried. **Nothing fails loudly**: presence throttles to one update per 4s with a trailing send, the progress loop retires on one failure, a 410 retires silently.
- **Presence elapsed timer measures this sitting** and is dropped when the round ends. Preview/playtest publish nothing (same `tracked` flag as the beacons).
- **Sharing:** `shareToChannel()` never throws and returns a boolean; `ResultModal.share()` copies on false. `openShareMomentDialog` accepts only a Discord CDN URL, hence the PNG score card (rects, not emoji; palette hard-coded from base.css). The upload goes through the Worker, which stores nothing. Sharing never raises a consent sheet (`peekToken()`, not `ensureAuthorized()`). `copyShareText()` falls back to `execCommand("copy")` because `navigator.clipboard` is blocked in the iframe. Don't use `sdk.commands.shareLink`.
- **Progress message:** Discord creates it via a signed interaction; identity comes off the signed payload, never the client. Edits never re-send `embeds`. `discord_messages` holds only `{opaque client-minted handle, interaction token, created_at}`; the interaction token never reaches the browser. Verify the Ed25519 signature on the **raw** body or 401 (a 401 on Discord's bad-signature probe is a pass). Avatar indices use **BigInt**; animated `a_` hashes need `.gif`. Updates are trailing, not queued. `resetProgress()` must run before the publisher inside `useRoundTelemetry`; don't call either from a page. `shareInteraction` is undocumented: if it breaks, only the loop is lost.
- **Social (`social.ts`, no scopes):** only the participant *count* leaves the module (never usernames/avatars); you are subtracted and the bar hides at zero. Invite hidden when `sdk.guildId === null`. PIP layout is scoped to `<html data-discord-layout="pip">`, never a width query.
- `/privacy`, `/terms`, `/press` are plain same-origin links with no `target="_blank"`. The game has no outbound links.
- localStorage inside Discord is sandboxed to `discordsays.com`, so Activity players have separate history.
- Deliberate holes in hook dependency lists carry `eslint-disable-next-line react-hooks/exhaustive-deps` on the line before the array, reason in the comment above. `react/set-state-in-effect` is off in `.oxlintrc.json` on purpose.

## After Dark

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
- The invite is its own band under the replay row (the check is the tallest card at 375px), fades in a beat after the check settles, and turns on live (`useBarInvite` polls; **never capture the night or settled state at mount**). Flare lights edges, never fill (contrast). A toolbar pill covers returning players.

**Data model**
- `drinks` / `drink_clues` / `drink_schedule` are their own tables, never a `kind` column on `dishes` (about ten queries read the dish pool unfiltered).
- Tiles: **country · spirit · temperature · profile**; country keeps near-match, the rest hit/miss. `spirit: 'none'` is a value. `is_alcoholic` is stored, never derived. Pool held between 55% and 75% alcoholic by `worker/data-integrity.test.ts`.
- Ingredient vocabulary is pooled with the kitchen's. `dish_requests.kind` is a column (an inbox, unlike a catalogue).
- Coaster sheet: 1 **First impression** (one angle: glass, ritual, look, hour; never the country, a region only with a second fact), 2 **The pour** (who, what goes in; may run two sentences; a year is one lens), 3 **Last call** (country placed naturally, appearance). Variety ratchets and an all-pairs no-repeat check live in `worker/data-integrity.test.ts`; `scripts/patch-clues.mjs --drinks` backfills `drink_clues` by slug. Names/budgets live once in `shared/clues.ts` (`COASTER_BEATS`). All dish beat-sheet hard rules apply; `lintClue` takes the sheet rather than being forked. The tab lists all three clues (`StoryDetails`).

**Sharing:** the tab shares the night grid plus the lunch grid. Night tiles use `⬛` for a miss, `🥃` pantry, `🥂` winning pour. A combined share fires the *nightcap* round's beacon only. `shareMessage` appends the url once to the whole message; grid folds are url-free (`shared/share.ts`). `RoundState.ingredientCount` is stamped on every lunch round so the grid redraws from storage.

**Theme:** `<html data-after-dark>`; `base.css` redefines tokens under `:root[data-after-dark]`. Attribute-scoped, never a media query.
- Measure contrast on the **painted** surface, not the token. A theme can't swap what a rule hardcodes: use `--paper-sheen`, `--paper-stipple`, `--row-fill`.
- `--hit` stays at the daytime value. `--paper-edge` must be lighter than what it sits on. Text on `--mustard` is `--on-near`, never `--ink`. Hover fill is `--cherry-hover`, never `--cherry-dark`. Never paint a one-off hex where a token belongs.
- `npm run a11y` scans three bar states; run it after any night-palette change.

**Dashboard and a Nightcap** (`kind = 'nightcap'`, a fourth `RoundKind`; `play_date` is the LOCAL night key and `guesses` is out of four)
- Never pool a Nightcap with a Special on a guess distribution or guesses-average. Counts pool fine.
- Never join `play_date` against `schedule`, never name a Nightcap from a dish; its target comes off `drink_id`. Exclude Nightcaps from the dish report outright.
- Write lists of kinds off `ROUND_KINDS` / `KIND_META`. A guess count beside another kind's carries its ceiling (`maxGuessesFor`).
- `tz_offset` is the one beacon field about the player's clock; the server drops impossible values to NULL. Compute the local hour in SQL from `started_at` + `tz_offset`, never from a UTC hour bucket (half-hour zones). The bar's hour axis opens at 20:00 and draws all 24 hours. The tab has no day picker.
- Crossover denominator is devices that *finished* a Special on a night `>= NIGHT_EPOCH_DATE`; nights from ET today forward are `pending`, outside the rate. `barOnly` devices and `outsideHours` rounds are counted apart, never dropped.
- After Dark takes `--plum` in the kind palette (not `--neon-pink`).

**Testing the bar:** `npm run lastcall` is the real flow. `?barhours=off` bypasses the clock only (not the finish-lunch gate); `?nightcap=<slug>` pins the pour; `?nightcap=random` is resolved client-side so the Worker never learns a random branch. All dev-only. In production only a signed token gets past the clock, untracked: `preview:drink:<id>` (24h, lands on `/?bar=1&preview=…`) or the showcase link. Logic in `worker/showcase.ts`.

**Showcase link** (`/?s=<token>`): opens a finished, won Special with the band lit, for someone who has never played.
- Seeded before React mounts (`applyShowcase` in `src/main.tsx`); written to a module variable, **never localStorage**; untracked. `isShowcase` is deliberately separate from `isPreview`. The clock override is cosmetic and client-side; the signature does the gating. The toolbar pill rides along (`(tracked || isShowcase) && dailyDone`). `leaveBar` hard-assigns `/`, dropping the token.
- **Cannot be revoked** (stateless HMAC; rotating `SESSION_SECRET` kills every session and preview). Lifetimes are a closed set (`SHOWCASE_TTL_DAYS`); the mint route 400s rather than clamping.
- Token format changes in `worker/auth.ts` (128-bit truncated signature, base36 expiry) are shared by every token and invalidate all live ones. Payload is `sc`, no colon; `classifyDrinkPreview` matches it exactly. Don't build a D1 short-code table.

## Occasions

A costume the game wears for a stretch of the calendar (Halloween first). **Handcrafted in code; /admin only decides when.** Never call it an "event" in a URL, path or table (ad blockers; `conventions.test.ts`).

- `shared/occasions.ts` is the only place that decides which occasion a day wears (`occasionOn`): the live booking covering it. **No booking, no costume.** `OCCASION_IDS` is a closed set; `OCCASIONS[id].suggested` only prefills the form and flags an unbooked season. Never `INSERT INTO occasion_bookings` from a migration or the seed.
- **Booked like a notice:** one row per run, both ends inclusive, Live outranks the dates. Live bookings never overlap (`findOverlap`, the Worker 409s), so one booking is one run and owns its numbers.
- **The day is the round's own, fixed at entry:** the puzzle date for lunch (a Leftover from Oct 31 replays in costume), the night key at the bar. Pages call `useWearOccasion(day)`; everything else reads `useOccasion()`. `primeOccasion()` dresses the page before mount (capped wait).
- `?occasion=<id>|none` is cosmetic and honoured in production on purpose. The Worker stamps `analytics_rounds.occasion` on insert from `play_date` and never reads the param.
- **A costume is `src/occasions/<id>/`**, a lazy chunk that fills the slots in `src/occasions/kit.ts`. A new slot is a deliberate change to `kit.ts` and the page that mounts it. CSS scoped to `:root[data-occasion="<id>"]`; anything that must show off-season (the Leftovers calendar mark) lives in game.css.
- **Decoration only:** `aria-hidden`, never under text, never recolours text or a fill text sits on. The one pressable slot (Cloche) is a real button with a label and announces its result.
- **Lights loop, the way the bar band's halo does:** no flash faster than 3/s (2.3.1), never over text, and every keyframe in the costume's own reduced-motion block, same commit. Looping past 5s with no pause control is a known WCAG 2.2.2 gap; reduced motion is the off switch.
- **A costume's palette is a token swap** scoped `:root[data-occasion="<id>"]:not([data-after-dark])` (an unscoped one ties with After Dark and repaints the bar). `--hit`/`--near`/`--miss` never move. Measure on the painted surface and add an a11y state for every screen the swap reaches.
- Share: `shareMessage(text, occasion)` adds the occasion's line between grid and url; the grid is untouched. Score card corner art is a pixel map, never emoji. Neither names the dish.
- Sounds: `OCCASION_SFX` in `shared/audio.ts`, files under `src/assets/sfx/occasions/<id>/`. Missing file = everyday sound.
- `npm run a11y` scans each room in costume; add states for a new occasion.
- **Reach (`occasion_views`, `POST /api/occasions/seen`):** one row per (occasion, device, ET seen_day, room, moment); moments `seen` and `knock`. The client sends only from a tracked round, never under `?occasion=` or before the bookings come back from the Worker (`noteOccasionMoment`); the Worker re-runs the fold on `play_day` and 400s a costume that day didn't wear. Runs are attributed by `play_day`, so a Leftover replayed later counts as "after", not as reach. Reach before the ledger's first row is unmeasured (`measuredFrom: null`), never zero.
- **Events page** (admin nav "Events", view `occasions`) works like Announcements: cards grouped On now / Booked / Ran / Pulled, "+ New event", an editor, Delete with a confirm. `GET /api/admin/occasions` returns each booking with its reach (the notices' strip on the card) and impact (folded: room, returned, knocked, after; same weekdays before via `baselineFor`, lunch and Nightcap apart, pooled rates, `shareVerdict`, first-time players). Schedule keeps only the dashed-ink day tags; Trends keeps the costume bands (annotations, dashed ink, never a fifth colour).

## Game rules

- **6 guesses.** `POST /guess` returns clue N after miss N from `clues.order_index`. Feedback: ingredient set intersection (exact, plus **close**) + 4 tiles. Country: hit = same country, near = same `region`, miss. Course/temperature/protein: hit|miss.
- A near country tile names its region (`attributes.country.region`) **in place of the tile's label**, never on its own line (tiles must stay one height). `region` is optional on the wire for old saved rounds.
- The order bar shows each dish's country but **searches names only** (`rankByName`, prefix before contains, accent-folded; never a `<datalist>`). Don't re-implement the search in a component.
- **Reveal is client-initiated after game over** (Wordle trust model; don't "fix" it).
- Unscheduled date → deterministic FNV-hash pick from active dishes; the game never 404s.
- The puzzle date rolls at **midnight ET for everyone** (`gameToday`, `msUntilGameMidnight` in `shared/time.ts`). Server accepts today ±2 days or any earlier puzzle back to `EPOCH_DATE` (`isPlayableDate`). Puzzle #1 = 2026-07-17.

### Ingredient families (amber "close" chip)

- A family is a **partition, never a graph**; all of it is `shared/families.ts` (`FAMILIES`, `STAPLES`, `STANDALONE`, `nearIngredients`). Staples are cousins of nobody. Spirits are `STANDALONE`. Keep a family tight ("a cook would swap one for the other").
- Only unmatched ingredients take part; each of the Special's is claimed once; the result names the *guess's* ingredient and the *family*, never the Special's partner.
- `unmatchedIngredients` stays the exact complement of `matchedIngredients`; a close one is in both it and `nearIngredients`, so counts, grids and old rounds are unchanged. The check's count is exact matches only.
- Close is never colour alone: dashed border + leading `≈` (`.chip--close`).
- CI enforces placement (`data-integrity.test.ts`, "the pantry"): every ingredient in a family, staple or `STANDALONE`; no plural twin; yellow rate under 30%. Ingredients typed in /admin bypass that test; the editors show `UnplacedHint`.
- `shared/families.ts` and `shared/pack.ts` import **only types** (`npm run docs:web` runs them under plain node; a test enforces it). The public project page ships a snapshot and a hand-picked `PLATES` list, never the catalogue (an unplayed Special could leak).

### Round modes

`resolveMode()` in `shared/mode.ts` is the table as code; GamePage reads its flags once. Don't re-derive a mode from `window.location`.

| Mode | Entry | localStorage | Lifetime stats | Analytics | Reads `schedule` |
|---|---|---|---|---|---|
| Today's Special | `/` | yes | yes | `daily` | yes |
| Leftovers | `?date=<past>` | per-date | no | `leftover` | yes |
| Chef's Choice | `?random=<seed>` | no | no | `random` | no |
| Preview | `?preview=<token>` | no | no | none | no |
| Playtest | `?special=<slug>` | no | no | none | no |
| Showcase | `?s=<token>` | no | no | none | yes |

- Archive unlocks once today's Special is finished. A finished daily is also saved to `lunch-special:archive` (the daily slot is overwritten each day). Never archive an unfinished daily. Recovered days (`POST /api/rounds/past` → `lunch-special:recovered`) are outcomes, never boards; `RECOVER_THROUGH` must never sit earlier than the release carrying #215; that route is temporary.
- Preview (admin test play, 24h token) records nothing. Playtest's `?special=` is honoured by the client only under `import.meta.env.DEV`. Preview and playtest are dressed as the daily (`dressedAsDaily`); only the top banner marks them; the share button fires no beacon.
- Streak: every printed streak goes through `shared/streak.ts`; never print `currentStreak` raw.
- Daily tally (`shared/tally.ts`): real daily only (`isToday`, not `asDaily`); nothing under `SMALL_SAMPLE_MIN`; percentage of finished rounds; never in the share text.
- **Sharing a finished round:** the whole message travels in one field, never `text` + `url`; `buildShareText` stays url-free. The idle label is "Share" everywhere (`shareLabel()` in `useShare.ts`). Phone test is a coarse *primary* `pointer`, not `any-pointer`; `canShare()` absent is not a refusal. A dismissed sheet (`AbortError`) is silent. Every success confirms.

### Beacons and analytics

- **Keep client-called URLs boring** (ad blockers match `analytics`, `event`, `track`, `visit`, `view` and similar; `shared/conventions.test.ts` enforces it). Beacons are `/api/rounds/seated|start|complete|share`, plus `/api/announcements/seen` and `/api/occasions/seen`; the admin feed is `/api/admin/recent-rounds`.
- `player_id` is an anonymous per-device UUID, bound only by `/start`. `kind` and `surface` are set on insert only; Discord iframe params are captured into sessionStorage and re-attached by `surfaceUrl()`. `country` is stamped server-side. `dish_id` is resolved by `resolveDishId` (random dishes send `seed`). `source` is re-normalised by the Worker always, captured into sessionStorage, never localStorage. Visits: `markSeated()` decides to send, `PRIMARY KEY (visit_day, player_id)` decides to count; first touch wins.

- **Guesses are written by the guess routes, not a beacon** (`analytics_guesses`, `worker/guesslog.ts`). The client sends `roundId` on `/guess` and `/night/guess` for tracked rounds only; previews, playtests and pins record nothing, and the Worker re-checks. No FK to `analytics_rounds` (a blocked `/start` must not drop a guess); the target is stored on the row, never joined from `schedule`. Dish and drink ids sit in separate column pairs. Rows older than 0053 are unmeasured. Each row carries the client's `player_id` too, so a wipe reaches guesses with no round row; wiping deletes them first. Last write per guess number wins (a retry after a lost response sends the board's dish). `correct` is not stored: it is guessed = target. Aggregate only on any public route; no per-device guess trail.

### Rules the dashboard obeys

- **Never report "unmeasured" as zero.** NULL `visited`, `country`, `dish_id`, `source` mean pre-feature rows: `untracked`, never a slice or a dish.
- Every rate off a denominator under `SMALL_SAMPLE_MIN` (30) carries its Wilson 95% interval, and nothing else does. A headline refuses to compare when it can't (`separated()`); undecided verdicts carry `daysNeeded`.
- Censored denominators: return rates only count a device after `RETENTION_WINDOW_DAYS` (7); the rest are `pending`, never no-shows. Prose headlines wait for their floors (`RETENTION_MIN_COHORT`, `DISH_MIN_COMPLETED`, `GROWTH_TREND_MIN_DAYS`, `WEEKDAY_MIN_OCCURRENCES`).
- Rates are **pooled over a period, never averaged across days**; experiment series ship raw counts.
- Broken measurements are dropped, never clamped (negative durations). `PLAYTIME_CAP_MINUTES` only reduces and says so. A duration needs both ends measured; never COALESCE `completedAt`/`sharedAt` onto `updated_at`. Median and p90, never a mean. Weekday figures are per-occurrence averages.
- Devices are partitioned, one country each (`foldCountries`). Count the right unit and name it: the funnel counts devices, `FinishRate` counts games; don't merge them. "Played again" needs the day's last `started_at` after its first completion.
- `DNF_GRACE_MINUTES` (2h) splits "still eating" from "walked out". The activity feed's row is a round, grouped by device × `playedDay`, never `play_date`. Retention and the funnel fold against the real `today`, never the picked day.
- **Chart axis ticks and value labels are absolutely positioned**, never in the flow of a fixed-height column.
- **Unserved dishes/drinks are veiled** (`src/admin/Veil.tsx`): real name absent from the DOM until the eye button is pressed, no timers. Any new spot printing a later name uses it.
- **Nothing on the dashboard animates**; `admin.css` declares no keyframes.
- `sound_prefs` is not a measurement; nothing may quote a rate off it.
- Colour has four taken meanings (kind: mustard/teal/cherry; event: start teal/complete cherry/share mustard; rank: teal ramp; annotation: dashed ink). Don't add a fifth. No colour is ever assigned to a player.
- Seven tabs, each one question: Today · Menu · Players · After Dark · Trends · Experiments · Activity (`?tab=`). Puzzle reads live on Menu; the 📅 `DayPicker` lives on Menu only and resets on leaving. `/api/admin/audience` is the one definition of "active" (a device that started a round). The KPI compares the last 7 complete days with the 7 before (`countChange`); today is never in it. Cohort cells and the weekly chart never print a zero for an unfinished week.
- **Admin Dishes filter** (`shared/dishfilter.ts`): within a facet OR, across AND; every chip's count drops its own facet; "never scheduled" means past *and* future; parked in sessionStorage through `normalizeFilter()`.
- **Admin Schedule board** (`shared/schedule.ts`): the picker is a hand-drawn listbox, never `<select>` or `<datalist>`; `matchDishes` searches names only; a name two dishes share resolves to neither; a close repeat is stated, never blocked; writes patch one entry and never refetch the window; nothing in a row changes size/colour/weight in flight (no `disabled`, use `aria-busy`); all four row buttons always render, hidden with `visibility`; the route owns the default window. Autofill and its balance line are informational.
- **Menu mix** takes no `surface` or `date` filter; one hue per bar.
- **What people order** (`/picks`, `worker/guessstats.ts`) reads `analytics_guesses`: dishes only, counts never rates, no `surface` filter (the ledger has none). Menu mix and Ingredient families are `Fold`s that mount, and fetch, only once opened. The dish report opens on 5 rows and keeps only Hardest and Recently served; all-time difficulty and "Served more than once" are folded. Players folds Repeat visits, arrival sources and countries the same way (`Fold`), each bar carrying its panel's headline sentence as the hint. Activity folds "This device's data"; Trends folds the growth chart; Today shows one "Housekeeping is clear" line instead of the schedule-health and content-warning cards until either has something to fix. **What people pour** is the same `GuessPanel` on After Dark over `/picks/drinks`: the dish and drink ledgers never meet, and `foldGuessStats` takes generic ids.

## First visit, notices, requests, sound

- **No auto-opened how-to.** Three coach marks (`order`, `pick`, `read`) are derived from the round (`shared/coach.ts`), never stepped or timed; `coachingDone` writes `lunch-special:howto-seen`. The spotlight is one fixed dim at `z-index: 35` with no cut-out (`.guess-input` sits at 40). Every callout has a ×. Showcase visitors are never coached; notices wait until the walkthrough ends. After Dark has a one-beat intro (`nightIntroDue`, `lunch-special:afterdark-seen`).
- **Announcements:** Today's Special only. Window is ET days, both ends inclusive; `is_active` outranks the dates. Logic in `worker/announcements.ts`. A notice you aren't eligible for never leaves the Worker. Body is limited markdown rendered as tokens; **no `innerHTML`, don't build an HTML renderer**. The `notice` modal drops from above so it differs from the check; its exit must stay within `MODAL_EXIT_MS`.
- **Requests:** `POST /api/requests` is public and anonymous. Inbox is `dish_requests` with `kind` (`REQUEST_KINDS`); the admin renders one section per kind off that enum. `is_fan_submission` is a credit only; nothing reads it for scheduling or feedback. "Add as dish/drink" pre-ticks it.
- **Sound:** two buses, one mute button, no audio files in the repo yet. A missing file is a supported state; the engine uses `import.meta.glob` and there is **no ENABLED flag**. Without files the whole system stands down. SFX are scheduled on the audio clock via `guessArc`, never `setTimeout`. `shared/audio.ts` timing constants mirror the CSS dial in game.css; re-time one and you re-time both. `AUDIO_DEFAULTS` is the only home of a default; stored prefs are optional fields. Reduced motion does not gate audio. `option-tick` is keyboard-only and computed outside the state updater.
- **My own test data** (Activity tab): "me" is the feed's `mine` filter (`peekPlayerId()`); review precedes wipe; tables are `analytics_guesses` (first, by `player_id` or round), `analytics_rounds`, `analytics_visits`, `announcement_views`, `occasion_views` (not `dish_requests`); the device id survives.
- **Issue composer:** GitHub is the record (no D1 table). `GITHUB_TOKEN` never reaches the browser. The read answers 200 with `configured: false`, the write 503. `GET /issues` drops PRs in `toIssue`.

## Adding dishes and drinks

`/create-dishes` and `/create-drinks` are the workflows; each skill's section 3 is the beat sheet. Read it before writing a clue. `worker/data-integrity.test.ts` enforces the mechanizable half. **Source every historical or numerical claim before writing it.** One-clue requests go to `suggest-clue`, which writes nothing.

- **Dish** = one `dishes` row + exactly 5 `clues`; schedulable only with ≥3 ingredients AND exactly 5 clues. **Drink** = one `drinks` row + exactly 3 `drink_clues`, ≥3 ingredients, pool inside 55–75% alcoholic.
- Rows go in `seed/seed.sql` **and** an additive `migrations/000N_add_<batch>.sql` (INSERTs only, keyed by slug). Never re-run the seed on prod. **Pool only; never a schedule row.**
- **Renaming a dish in /admin regenerates its slug, and every backfill migration is keyed by slug**, so an earlier migration's `UPDATE`s silently match nothing. Re-aim with a new migration. `RETIRED_SLUGS` / `RENAMED_SLUGS` in the integrity test are how a slug leaves.
- Fan submissions: `UPDATE … SET is_fan_submission = 1 WHERE slug IN (…)` in both files; leave `INSERT` column lists alone. A suggested dish the catalogue already has still takes the credit (UPDATE only; say so in the migration comment).
- Finish with `npm test && npm run check && npm run lint`.

## Conventions / gotchas

- Ingredients: JSON TEXT, canonical lowercase singular. Reuse existing vocabulary.
- Schedule: past dates locked; deleting or deactivating a dish scheduled today/future is blocked; `PUT /schedule` and `PUT /nights` refuse inactive items. Autofill: rest tier → variety penalty → exact rest (`worker/variety.ts`), skipping the last 60 days. The shuffle (🎲) rolls a never-scheduled, schedulable dish and writes on every click. Clearing a day deletes its row; the fallback pick covers it.
- Regions: north-america, latin-america, europe, middle-east, africa, south-asia, east-asia, southeast-asia, oceania. Courses: breakfast, appetizer, entree, dessert, drink. Proteins: beef, pork, poultry, seafood, lamb, vegetarian.
- Seed SQL: escape apostrophes as `''`. Windows repo; CRLF warnings are noise.
- **Build marker:** the footer's last line shows the version (`v1.7.0`, `*` if dirty; never sha or branch, which ride on `title` and the admin line). Always on, in page flow (never a fixed badge), not a setting, nothing reaches the server. `__BUILD__` is a vite `define`; folds take a `BuildInfo` and never read it (`shared/conventions.test.ts` enforces this for `worker/` and `shared/`). "No git" reads as `dev`.
- `vitest.config.ts` is separate from `vite.config.ts` on purpose (tests must not load the cloudflare plugin); it covers `worker/` and `shared/`.
- `tsc -b` is incremental and can report success on a stale graph; use `npx tsc -b --force` after changing a `shared/` type. Three composite projects: worker code uses no DOM libs. `worker-configuration.d.ts` is generated, never hand-edited.
- Cookies: HttpOnly+Secure+SameSite=Strict, 7-day HMAC token. Routes under `worker/routes/admin/` are mounted in a load-bearing order: `auth.ts` above the session guard, everything else below.
- Public GETs with a `Cache-Control` header: `/api/dishes` and `/api/night/drinks` only (5 min). Keep it off `/daily`, `/occasions` and the beacons.
- Don't add npm deps casually; the only runtime deps are hono, react, react-dom.
- Art: swap `ai-*.svg` in place (same viewBox ratio, keep the AI-GENERATED header) and update `ASSETS.md`. The neon logo is CSS text.
- **No emoji in the game's chrome**; draw `Icon` (`src/game/Icon.tsx`, add a path to `PATHS`). Share text keeps emoji.
- **Three faces:** Alfa Slab One (sign, 1rem and up only), Yellowtail (neon/flourish), League Gothic `--font-gothic` (tabs, labels, small print). Fonts ship as `.woff2` only. Paper surfaces take `--radius-paper`, controls `--radius`. One job per face: Alfa Slab = headings and big numbers, Gothic = labels, Georgia = reading text and controls; Yellowtail = the neon title only. Sizes come from the `--fs-xs`…`--fs-xxl` scale in `base.css`; no raw rem or px font sizes in `admin.css`, nothing under `--fs-xs`.

## Accessibility (player-facing UI)

WCAG 2.1 AA for the game; `/admin` is exempt.

- **Never encode meaning in colour alone**: pair with a glyph/border and an `.sr-only` text, all off `shared/announce.ts`. `title` doesn't count.
- **Anything that changes after a user action is announced** (`role="status"` + `aria-live="polite"`); the guess flow uses two regions because the clue lands ~1.14s after the row.
- **Don't remove a focus indicator without replacing it.** `:focus-visible` is declared once at the bottom of `game.css`.
- **Every animation goes in the reduced-motion block** at the bottom of `game.css`, same commit as the keyframe. `playSfx()` deliberately does not check it.
- **Check contrast before picking a colour**; use `base.css` tokens (`--hit-ink` 5.56, `--on-cherry` 4.85).
- **`:hover` never fires on touch**; keep the `:active` press rules.

`npm run a11y` fails CI on serious/critical. A green run is a floor.

## Documentation

**The wiki is the only source of truth for documentation.** The repo carries this file, the two beat-sheet skills (`.claude/skills/create-dishes`, `create-drinks`), `ASSETS.md`, `README.md`, and directory READMEs.

- **Don't create a new top-level `.md`**; a change that wants one wants a wiki note.
- **Never write the wiki's path into the repo** (comment, doc or commit message); say "the wiki". It lives in agent memory and `.claude/wiki-path.local`.
- **Wiki notes are written under `/stop-slop`.** House style: non-verbose, `[[wiki links]]`, tables and mermaid over paragraphs, no em dashes, active voice.
- `docs/lessons/` is the one non-wiki doc surface (self-contained HTML walkthroughs; see its README).
- **Check `docs/index.html` before coining a term.** It holds the vocabulary (beats, beat sheet, the Special, clue ticket, the check, Leftovers, Chef's Choice, note from the kitchen).

**Before opening a PR:** (1) does this file still tell the truth? Edit it in the same PR. (2) Update the wiki note that covers the change, before the PR. (3) confirm labels; the wiki-path leak is caught by `npm test` on your machine (`gh label list` → `gh pr create --label`).

## Verify a change

`npm test && npm run check && npm run lint`, then the dev server (`npm run a11y` in a second terminal), then by hand: play a full round (miss twice → clue tickets → win → receipt), **then `npm run lastcall` and walk the hand-off into a Nightcap**, check /admin (dashboard, editor, schedule, Bar) and 375px (no horizontal scroll). For UI changes also do the keyboard-only and reduced-motion passes, plus 320px and 200% zoom. Seeded local answer for 2026-07-17 is Hamburger (id 51).
