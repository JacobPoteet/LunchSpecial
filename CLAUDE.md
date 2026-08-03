# CLAUDE.md — Lunch Special

Daily Wordle-style game: guess the diner's "Special" (a world dish). 1950s diner theme. One Cloudflare Worker serves everything: React SPA (Workers Static Assets) + Hono API + D1. No accounts; player state in localStorage.

## Commands

```bash
npm run dev          # vite dev (Worker runs in workerd via @cloudflare/vite-plugin), http://localhost:5173
npm run play         # vite dev + opens /play: a fresh round on a RANDOM dish, nothing saved (dev-only free play)
npm run ramen        # same, but pinned to one named dish (/play?special=ramen) — playtest a specific board
npm test             # vitest — worker/{game,stats,data-integrity}.test.ts
npm run check        # tsc -b (3 project refs: app / worker / node)
npm run build        # tsc -b && vite build → dist/
npm run deploy       # build + wrangler deploy
npm run db:migrate   # apply migrations to LOCAL D1   (db:migrate:remote for prod)
npm run db:seed      # run seed/seed.sql on LOCAL D1  (bootstrap only — see warning below)
npm run db:export:remote    # dump PROD D1 → backups/prod-full-<stamp>.sql (gitignored). Take one before any prod DB work
npm run db:export:catalog   # same, but dishes+clues+schedule only — no player data, safe to diff against seed.sql
npm run db:export           # local DB, all tables
npm run cf-typegen   # regenerate worker-configuration.d.ts after wrangler.jsonc changes
```

Local admin password: `ADMIN_PASSWORD` in `.dev.vars` (gitignored; currently `lunchboss`). Browser preview: `.claude/launch.json` has server name `lunch-special`.

## Deploy to Cloudflare

**Live:** https://lunchspecial.app (custom domain on the Worker; lunch-special.jacobwilliampoteet.workers.dev is the underlying workers.dev URL) — bootstrap is done and releases are automated (see CI below). The steps below are the record of that setup and what you'd repeat to bootstrap a fresh environment.

### One-time bootstrap (manual — touches the CF account + secrets)

1. `npx wrangler login` (logged in as jacobwilliampoteet@gmail.com)
2. `npx wrangler d1 create lunch-special-db` → paste returned UUID into `database_id` in wrangler.jsonc. Commit it — DB ids are not secret. (Prod id `f331205d-c816-48c9-b099-0fb15b7605ba` is already set.)
3. `npm run db:migrate:remote && npm run db:seed:remote` (seed once, by hand — see CI note below)
4. Set the two Worker secrets directly (interactive prompt — you type the value; run in your own terminal): `npx wrangler secret put ADMIN_PASSWORD` then `npx wrangler secret put SESSION_SECRET` (a long random string, e.g. `openssl rand -hex 32`). They persist across deploys, so CI never touches them.
5. First deploy by hand to confirm it works: `npm run deploy` → https://lunchspecial.app
6. Verify: play a guess on the live URL, log into /admin

### Where secrets live

- **Worker secrets** (`ADMIN_PASSWORD`, `SESSION_SECRET`): set directly on the Worker via `wrangler secret put`. They live on the Worker and persist across deploys, so CI never needs them.
- **CI credentials** (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`): stored as **GitHub Actions secrets** (Settings → Secrets and variables → Actions).
  - `CLOUDFLARE_API_TOKEN` — a CF API token with the "Edit Cloudflare Workers" template scope + D1:Edit
  - `CLOUDFLARE_ACCOUNT_ID` — `9016037cfaa0836d9bbc85d754935cb5`

### Automated releases (CI)

Three workflows, deliberately scoped so routine pushes don't pay for the full gate:

| Workflow | Fires on | Does |
|---|---|---|
| `ci.yml` | push + PR to `main` | `npm test` → `npm run check` |
| `codeql.yml` | push + PR to `main`, weekly cron (Mon 04:27 UTC) | security-and-quality scan |
| `deploy.yml` | `v*` tag, or manual dispatch | test + check + remote D1 migrate + deploy |

`ci.yml` and `codeql.yml` both **skip prose/asset-only changes** via an identical `paths-ignore` (`**.md`, `docs/**`, `discord-assets/**` — none are covered by vitest or any tsconfig project). Keep the two lists in sync; Actions doesn't support YAML anchors. Both also set `concurrency` with `cancel-in-progress: true`, so a follow-up push supersedes the in-flight run instead of racing it. **If CI ever becomes a required status check, `paths-ignore` will hang doc-only PRs on "Expected — waiting for status"** — switch to an always-running gate job at that point.

`deploy.yml` deploys on any pushed tag matching `v*` (and via manual "Run workflow" / `gh workflow run deploy.yml`). Steps: `npm ci` → write a placeholder `.dev.vars` → `npm run cf-typegen` → `npm test` → `npm run check` → remote D1 migrate → `npm run deploy`. It re-runs test+check on purpose — the deploy gate shouldn't trust that CI already passed on some earlier commit. All three use `actions/checkout@v7` + `actions/setup-node@v7` on Node 22. Cut a release with:

```bash
git tag v1.1.0 && git push origin v1.1.0
```

CI gotcha: `worker-configuration.d.ts` and the `Env` secret members are generated from `.dev.vars` — both gitignored — so the workflow regenerates types (`cf-typegen`) and writes a dummy `.dev.vars` (placeholder values; the real secrets live on the Worker) before the typecheck/build, or `tsc` fails on missing runtime types / `Env` members.

CI runs migrations (idempotent, additive) but **never** the seed — `seed/seed.sql` DELETEs and re-inserts every dish, which would wipe admin edits. Seed only by hand, once, during bootstrap.

### Prod D1 is the only copy of half the data

`seed.sql` + `migrations/` reconstruct the dish **pool** and nothing else. The `schedule` (booked in /admin, not in this repo — never add `INSERT INTO schedule` rows), every admin dish edit, `analytics_rounds`, and `dish_requests` live **only** in prod D1 and have no repo representation. Divergence between the dashboard and `seed.sql` is therefore expected and correct, not drift to reconcile.

Two consequences: (1) `npm run db:seed:remote` is destructive — its `DELETE FROM schedule` deliberately steps around the `schedule.dish_id` FK that would otherwise block the dish wipe, so a stray run replaces every hand-booked Special with the stock 30-day block and reverts all admin edits; (2) there is no automatic backup. Run `npm run db:export:remote` before any prod DB work. Dumps land in gitignored `backups/` — full dumps carry anonymous `player_id` UUIDs, so keep them local; use `db:export:catalog` for anything you'd share.

Note: the vite plugin writes a build-processed config into dist/; plain `wrangler deploy` from the repo root picks it up (the `deploy` script already chains build first).

## Discord Activity

The game also runs as a **Discord Activity** (embedded iframe app) — **no separate build**. Discord doesn't host the code; it frames `lunchspecial.app` through its proxy via a URL mapping. So the same `npm run build` / `npm run deploy` ships both the public site and the Activity. The only Discord-specific code is `src/discord/bootstrap.ts`, activated purely at runtime.

- **Detection:** `isDiscordActivity()` checks for the `frame_id` query param Discord adds to the iframe URL. On the open web it's absent, so `initDiscord()` returns null and the Embedded App SDK (`@discord/embedded-app-sdk`, behind a **dynamic import**) is never downloaded — zero cost to web visitors.
- **Boot:** `src/main.tsx` awaits `initDiscord()` before mounting React. When embedded, it completes the SDK `ready()` handshake, then the existing game runs **anonymously** exactly as on the web (localStorage state, no accounts). Current scope is "minimal embed": no OAuth / user identity yet.
- **Sharing results inside the Activity = copy to clipboard.** The receipt's share button builds the same emoji grid as the web (`buildShareText()`), then on the `discord` surface copies `text + SHARE_URL` via `copyShareText()` (src/game/share.ts) and relabels itself "Copied — paste it in chat!". No SDK involved. The Web Share sheet is skipped outright in the embed — the iframe has no `web-share` permission, and its rejection handler leaves the button looking untouched.
  - `copyShareText()` tries `navigator.clipboard.writeText` and **falls back to a hidden-textarea `document.execCommand("copy")`**. That fallback is the point: `navigator.clipboard` is gated behind the `clipboard-write` permissions policy, which Discord's iframe doesn't grant, so the modern API alone just rejects there. `execCommand` only needs a user gesture. It returns a boolean and the button shows a retry label on `false` — never let a share fail silently.
  - **Previously tried and reverted:** `sdk.commands.shareLink({ message })` (Discord's own share modal, posts as the player with a deep link back into the Activity). It kept erroring in practice — the button just showed the retry label. A Discord-native share is worth revisiting, but re-read this before reaching for `shareLink` again. `openShareMomentDialog` is not the answer either: web-only and needs a Discord CDN image URL.
  - **If you do wire the SDK back up, the 5s `ready()` cap must not gate it.** The cap only decides *when React mounts* so a stalled handshake doesn't white-screen the iframe; a handshake landing at 5.1s is still a perfectly good SDK. The original #49+#51 shape registered the instance only on the race's winning branch, which silently killed the share button on every slow Activity start.
- **Why it works with no proxy gymnastics:** the app is same-origin + self-contained — all client calls are relative `/api/*`, all assets/fonts/art are Worker-served (no CDNs). Discord's "route everything through the proxy" rule is satisfied automatically by a root URL mapping.
- **Client ID:** `VITE_DISCORD_CLIENT_ID` — a **public** build-time Vite var (ships in the bundle; NOT a secret; do not put it in `.dev.vars`). Local dev: add it to `.env.local` (gitignored; see `.env.example`). CI: set it as a repo Actions **Variable** (not secret) — `deploy.yml` passes it to the build.
- **localStorage caveat:** inside Discord it's sandboxed to the `discordsays.com` origin, so Activity players have a **separate** game history from lunchspecial.app. Acceptable for the anonymous MVP; unifying stats is the (future) OAuth path.

### Discord Developer Portal (one-time, manual — not in this repo)

1. Create an app → copy **Client ID** into `VITE_DISCORD_CLIENT_ID` (local `.env.local` + CI Variable).
2. Enable **Activities** in the app's Embedded settings.
3. Add **URL Mapping**: prefix `/` → `lunchspecial.app`.
4. Add an OAuth2 redirect URI (`https://127.0.0.1` placeholder is fine for the embedded flow).

**Dev testing inside real Discord:** Discord can't reach `localhost`, so it needs a public HTTPS URL. Run `npm run dev` in one terminal and `npm run tunnel` (cloudflared quick tunnel → :5173) in another, then point the portal's URL Mapping at the printed `*.trycloudflare.com` URL while testing. (`cloudflared` must be installed separately.)

## Layout

```
wrangler.jsonc        assets SPA fallback + run_worker_first:["/api/*"] + D1 binding "DB"
migrations/0001_init.sql   dishes / clues / schedule tables
seed/seed.sql         68 dishes, 5 clues each, 30-day schedule from 2026-07-17. Idempotent (DELETEs first)
shared/types.ts       ALL shared types + enums (COURSES, REGIONS…) + MAX_GUESSES + EPOCH_DATE
worker/index.ts       Hono entry; only /api/* reaches the Worker (assets serve the rest)
worker/game.ts        PURE game logic (feedback, puzzleNumber, date validation, fallback pick) — unit tested
worker/auth.ts        HMAC tokens: session cookie + preview tokens (stateless, SESSION_SECRET-signed)
worker/db.ts          row mapping, getTargetDish (schedule row else deterministic fallback), serverToday
worker/menu.ts        PURE menu-mix fold (schedule × dishes → region/course/protein ratios) — unit tested
shared/time.ts        GAME_TIMEZONE (America/New_York), gameToday, msUntilGameMidnight — the midnight-ET daily rollover, shared by worker + client
worker/routes/public.ts   /api/dishes, /daily, /guess, /reveal — never leak target except via /reveal
worker/routes/admin.ts    /api/admin/*: login/logout/session, dish CRUD, ingredients vocab,
                          schedule GET/PUT, autofill, preview token, dashboard,
                          analytics aggregates + /recent-rounds (recent-activity feed),
                          /menu-mix (menu composition — catalogue, not players)
src/discord/          bootstrap.ts = Discord Activity runtime hook (frame_id detect + SDK ready); dynamic-imported, web pays nothing
src/App.tsx           path startsWith /admin → lazy AdminApp, else GamePage (no router lib)
src/api.ts            public fetch wrappers + localToday()
src/game/             GamePage (orchestrator), components.tsx (Modal/GuessRow/ClueTicket/GuessInput/Countdown),
                      storage.ts (localStorage round+stats), share.ts (emoji grid)
src/admin/            AdminApp (session+nav), api.ts, Dashboard, MenuMixPanel (menu composition),
                      DishList, DishEditor (live preview reuses game components), ScheduleView
src/styles/           base.css (tokens/fonts), game.css, admin.css — hand-written CSS, BEM-ish, no framework
src/assets/art/       ai-*.svg = AI placeholder art (keep the AI-GENERATED header comment); fonts = OFL
```

## Game rules (server-enforced shapes in shared/types.ts)

- 6 guesses; clue N returned by POST /guess after miss N (N=1..5, from `clues.order_index`)
- Feedback: ingredient set intersection + 4 attribute tiles. Country: hit=same country, near=same `region`, miss. Course/temperature/protein: hit|miss
- Date = the current puzzle date (YYYY-MM-DD), which **rolls over at midnight ET (`America/New_York`) for everyone**, not the browser's local midnight or UTC — `gameToday()` in shared/time.ts, used by both the client (`localToday`) and the worker (`serverToday`). Server accepts a **playable date** — today (±2 days of ET now for clock/rollover slack) or any earlier puzzle back to EPOCH_DATE. Future dates beyond the ±2-day window are rejected so upcoming Specials aren't spoiled (`isPlayableDate` = `isAllowedRequestDate` ∪ `isArchiveDate` in worker/game.ts). Puzzle #1 = 2026-07-17 (EPOCH_DATE). The player's "Next Special in …" and the admin dashboard's "Switches in …" both count down to the next midnight-ET via `msUntilGameMidnight`
- **Archive** (play previous days): `?date=<past puzzle>` on / replays an earlier Special. Client shows a "Menu Archive" calendar (unlocked once today's Special is finished) of every puzzle EPOCH→today with per-day status. Archive rounds persist per-date in `localStorage` (`lunch-special:archive`) but do **not** touch lifetime Stats/streak (Wordle-style). They **do** record anonymous analytics as the `leftover` kind — one of three round kinds (`daily` = Today's Special, `leftover` = archive replay, `random` = Chef's Choice) the admin dashboard breaks "games started" down by (migrations/0007, worker/routes/analytics.ts + admin `/analytics`). See src/game/ArchiveModal.tsx + archive.ts + storage.ts.
- **New vs returning players**: the `/start` beacon carries an anonymous, stable per-device `player_id` (random UUID in `localStorage` key `lunch-special:player`, via `getPlayerId()` in storage.ts; migrations/0008). The admin `/analytics` folds each player's active ET days: their earliest day counts them as **new**, every later active day as **returning** (all-time `players.new` = distinct players ever, `players.returning` = those who came back). The dashboard shows today's new/returning counts and an all-time two-line chart (`PlayerLineChart` in Dashboard.tsx). Anonymous device count only — no accounts.
- **Surface (web vs Discord)**: every beacon carries a `surface` — `web` or `discord` (`SURFACES` in shared/types.ts; migrations/0009) — resolved client-side once via `currentSurface()` in src/discord/bootstrap.ts (the `frame_id` signal, same as `isDiscordActivity()`). Set on insert only, like `kind`. Because mode switches navigate by assigning a URL (`goToday`/`goRandom`/`openArchiveDate`), which wipes the query string, Discord's iframe params are captured on first load into sessionStorage: `currentSurface()` reads that sticky copy, and every in-app URL goes through `surfaceUrl()` to re-attach them (so the SDK handshake also survives the hop). Skipping either made Chef's Choice / Leftovers log as `web` inside Discord. The admin dashboard's engagement panel has a **Web / Discord / All** segmented toggle (`SurfaceToggle` in Dashboard.tsx) that re-fetches `/analytics?surface=<web|discord>` (omit = all); the worker splices a whitelisted `surface = '…'` clause into every aggregate query. Pre-0009 rows default to `web`.
- **Day picker**: the engagement panel's day slice (the "Today's Special" block) defaults to today but a 📅 calendar dialog (`src/admin/DayPicker.tsx`) can swap in any earlier ET day — `GET /api/admin/analytics?date=YYYY-MM-DD`, which the worker returns as `day` (plus `today` and `activeDates`; the old `today: {…}` object field is now `day`). Only days in `activeDates` — ET days that recorded any round, derived from the same all-time hour buckets the hourly chart uses, so it honours the surface filter — are clickable. The day's `startedByKind` comes from its own ±1-day UTC window folded to ET, **not** from the `daily` series, which only reaches back ~5 weeks. All-time charts/tables and the activity feed are unaffected by the picked day.
- **Recent activity feed**: the admin dashboard's engagement panel ends with a log of the individual beacons behind the charts — newest first, with the ET wall clock + "3m ago", the event type (Started / Finished / Shared), game kind, dish + puzzle number, result (`Solved in 4` / `Out of guesses (6)`), surface, and the anonymous player id (`RecentEvents` in Dashboard.tsx, `GET /api/admin/recent-rounds?limit=&surface=`). **Don't rename that route back to anything matching `analytics/event`** — ad blockers ship filter rules for that path shape and cancel the request in-browser, which reads as a bare "NetworkError" with nothing in the Worker logs (GitHub #47 follow-up). Same reason `request()` in src/admin/api.ts translates a rejected `fetch` into a "check your ad/content blocker" message. `analytics_rounds` is still one row per round; the endpoint UNIONs it back into three event streams. migrations/0011 added `completed_at`/`shared_at` so finishing and sharing get their own timestamps — before it, `updated_at` was clobbered by whichever beacon landed last, so pre-0011 rows fall back to it and show both events at the same time. The feed names the dish from `analytics_rounds.dish_id` (migrations/0012), set on insert by the beacon handler (`resolveDishId` in analytics.ts): a `random` (Chef's Choice) dish is picked from the round's `seed` and is **never** in the `schedule`, so the old "join `schedule` on play_date" resolution could only show it blank — the client now sends `seed` on the start/complete beacons so the server can resolve and store the actual dish. Pre-0012 rows have NULL `dish_id` and fall back to the schedule-by-date join (random stays blank for those, as before).
- **Menu mix** (admin dashboard, above the engagement panel): what the *kitchen* has been serving, as opposed to what players did with it. `GET /api/admin/menu-mix` joins `schedule` × `dishes` and hands every row to the pure `assembleMenuMix()` in worker/menu.ts (unit-tested in menu.test.ts); `src/admin/MenuMixPanel.tsx` charts it. Three slices — **served** (schedule rows EPOCH→today), **booked** (future rows), **pool** (active dishes) — each counted by region / course / protein / temperature, plus countries, a top-ingredients "pantry", repeat dishes, and a region-cadence strip over the last 60 Specials. No player data, so it takes no `surface`/`date` filters and no analytics tables. Two things to preserve if you touch the charts: (1) **every bar is one hue** — these are nominal categories, so bar length already carries the value and nine region colours would just re-encode it; (2) the grey tick on a bar is the **pool's** share of that category, which is what makes over/under-serving visible without a second series. Days from EPOCH with no schedule row ran on the deterministic fallback pick and can't be reconstructed (the pool moves), so they're reported as `unscheduledDays` rather than folded into `served`.
- **Beacon paths are blocker-bait — keep them boring.** The engagement beacons POST to `/api/rounds/start|complete|share` (mounted in worker/index.ts; the handler file is still `worker/routes/analytics.ts`), and the admin feed reads `/api/admin/recent-rounds`. They were originally `/api/analytics/*` and `/api/admin/analytics/events`, which ad blockers match by pattern — the admin one failed loudly (a bare `NetworkError`, nothing in the Worker logs), but the **player beacons failed silently**: they're fire-and-forget, so a blocked beacon is indistinguishable from a delivered one and those players simply never appeared in any count. Don't reintroduce `analytics`, `event`, `track`, `collect`, `beacon`, `telemetry`, or `pixel` into a client-called URL. (`/api/stats` is fine — shields.io fetches it server-side, no browser involved.)
- **Dish requests** (player suggestions): after any finished round the receipt shows a "Suggest a dish for the menu" form (`RequestDishForm` in GamePage.tsx). It POSTs `{ name, country?, note?, surface, playerId? }` to the **public** `POST /api/requests` (worker/routes/public.ts) — anonymous, same trust/dedup model as analytics; an exact same-device name is silently ignored. Rows land in the `dish_requests` table (migrations/0010), an inbox separate from the `dishes` catalog. Admin **Requests** tab (`src/admin/RequestsView.tsx`, nav badge = pending count): review, **Remove** one / **Clear all** (`DELETE /api/admin/requests/:id`), **Add as dish** (opens a New Dish editor prefilled with name+country; on first save the source request is auto-removed via `requestId`→`deleteRequest`), and **Copy all for Claude** → an `add dishes: Name (Country), …` line matching the Adding-dishes workflow below. Field caps in `DISH_REQUEST_LIMITS` (shared/types.ts).
- Unscheduled date → deterministic FNV-hash pick from active dishes (game never 404s)
- `?preview=<token>` on /, /daily, /guess, /reveal = admin test play; skips schedule, localStorage, and stats
- **Random recipe** ("cook's choice"): `?random=<seed>` picks a random active dish (deterministic per seed via the FNV hash, so daily/guess/reveal agree; a new seed = a new dish). Spoiler-free (never touches the schedule), so it's available to everyone in prod. Skips localStorage + lifetime stats, but **does** record anonymous analytics as the `random` kind (unlike preview, which records nothing). Reachable from the Menu Archive. Nothing gates it server-side (the old `DEV_FREEPLAY` var is gone); dev keeps the `/play` route + `?freeplay` (client behind `import.meta.env.DEV`) as convenience entrances — `npm run play`.
- **Playtest a named dish**: `?special=<slug>` pins the round to one dish by slug (`getDishBySlug` in worker/db.ts; resolved in `resolveTarget` ahead of `random`). `npm run ramen` = `vite --open /play?special=ramen`; add a sibling script for any other dish. Spoiler-free for the same reason `random` is — it never reads the `schedule` — and the slugs are already public via `/api/dishes`, so the worker takes it unconditionally, but the **client only honours it behind `import.meta.env.DEV`**. It's the most throwaway mode: no localStorage, no lifetime stats, and **no analytics** (like preview, unlike random). An unknown slug 400s with `No dish with slug "…"`, which the client shows on the closed-kitchen sign
  - It exists to rehearse the **end-of-round screen**, so it's *dressed* as the daily wherever that's visible: the date's real puzzle number (`/daily` numbers a `special` round, unlike preview/random), the "Daily Special" line, and a check with the countdown, share button, stats panel and 📅 Play again — `dressedAsDaily` in GamePage.tsx, which the check takes as `asDaily`. Finishing one also unlocks the archive the way finishing the daily does. Only the top banner marks it. Two seams are deliberate: the stats panel shows the numbers you walked in with (nothing was recorded), and the share button copies a real grid but fires no beacon
- Reveal is client-initiated after game over (Wordle trust model — don't "fix" this)

## Adding dishes (when asked)

The user will say things like **"add dishes: Pho (Vietnam), Bibimbap (South Korea), Empanadas (Argentina)"**. Minimum they must give per dish is the **name** (country helps). I infer the rest (region/course/temperature/protein/ingredients/5 clues) from the dish — but **ask, don't guess, when a field is genuinely ambiguous** (e.g. regional protein variants). If they want full control they can specify any field explicitly.

**One dish = one `dishes` row + exactly 5 `clues` rows.** A dish is only schedulable with **≥3 ingredients AND exactly 5 clues** — always produce both.

### Per-dish fields (all NOT NULL; enums CHECK-enforced in migrations/0001_init.sql)

| Field | Rule |
|---|---|
| `name` | Display name, **unique**. Double apostrophes in SQL (`Shepherd''s Pie`) |
| `slug` | lowercase-kebab of name, **unique**, ASCII — strip accents (`Crème Brûlée` → `creme-brulee`) |
| `country` | Real country, free text (`Italy`, `United Kingdom`, `Türkiye`) |
| `region` | Exactly one of: `north-america` `latin-america` `europe` `middle-east` `africa` `south-asia` `east-asia` `southeast-asia` `oceania`. Drives the yellow "near" country match — bucket the country correctly |
| `course` | `breakfast` \| `appetizer` \| `entree` \| `dessert` \| `drink` |
| `temperature` | `hot` \| `cold` (as served) |
| `protein` | `beef` \| `pork` \| `poultry` \| `seafood` \| `lamb` \| `vegetarian`. Pick the dominant one; `vegetarian` if none |
| `ingredients` | JSON array, **canonical lowercase singular**, **≥3** (aim 5–8). Reuse existing pantry spellings — `tomato` not `tomatoes`, `bell pepper`, `olive oil`. Grep seed.sql for an ingredient before coining a new spelling |

### The 5 clues (`order_index` 1→5, revealed after each miss — never name the dish)

1. Broad geography/region hint ("comes from Europe — a country shaped like a boot")
2. Origin / history
3. Fame / pop-culture moment
4. Key ingredient or technique
5. Near-giveaway (everything but the name)

### Where the rows go

- **Append to `seed/seed.sql`** (the canonical catalog): next sequential dish `id`, same `INSERT INTO dishes (...) VALUES` format, and 5 clue rows in the `INSERT INTO clues` block. Keep it the source of truth.
- **Also add an additive migration** `migrations/000N_add_<batch>.sql` to ship them to the LIVE DB — INSERTs only, **no `DELETE`s**, dish **keyed by slug** not a hardcoded id (`(SELECT id FROM dishes WHERE slug='…')` for clue `dish_id`). Never re-run the seed against prod (it wipes admin edits); CI applies the migration on the next `v*` release.
- **Pool only — never touch the `schedule` table.** New dishes land in the active pool (`is_active` defaults to 1); leave assigning them to dates to the `/admin` auto-fill (least-recently-served, skips dishes used in the last 60 days). Don't add `INSERT INTO schedule` rows.
- Finish with `npm test && npm run check`; verify each new dish has 5 clues + ≥3 ingredients before committing.

## Conventions / gotchas

- Ingredients: JSON TEXT column, canonical lowercase singular ("tomato" not "tomatoes"). Admin tag input autocompletes from existing vocabulary — reuse names, don't fork spellings
- Dish is "schedulable" only with ≥3 ingredients AND exactly 5 clues (enforced in PUT /schedule + shown in UI)
- Schedule: past dates locked; DELETE dish blocked while scheduled today/future; autofill = least-recently-served, skips dishes used in last 60 days
- Regions enum (near-match buckets): north-america, latin-america, europe, middle-east, africa, south-asia, east-asia, southeast-asia, oceania. Courses: breakfast, appetizer, entree, dessert, drink. Proteins: beef, pork, poultry, seafood, lamb, vegetarian
- SQL in seed files: escape apostrophes as `''`
- vitest.config.ts exists SEPARATELY from vite.config.ts on purpose (tests must not load the cloudflare plugin)
- tsconfig is 3 composite projects; worker code must not use DOM libs; app code gets DOM. Shared/ is included by both
- `worker-configuration.d.ts` is generated (gitignored) — run cf-typegen, never hand-edit; Env type comes from it
- Cookies: HttpOnly+Secure+SameSite=Strict, 7-day HMAC token ("session" payload). Password check is digest-compared (timing-safe-ish)
- Don't add npm deps casually — the only runtime deps are hono, react, react-dom
- Windows repo (CRLF warnings from git are noise; ignore)
- Changing art: swap ai-*.svg in place (same viewBox ratio), update ASSETS.md; the neon logo is CSS text, not an image

## Verify a change

`npm test && npm run check`, then dev server: play a full round (guess wrong twice → clue tickets appear → guess right → receipt modal), check /admin dashboard/editor/schedule, and mobile at 375px (no horizontal scroll). Seeded local answer for 2026-07-17 is Hamburger (id 51); schedule table maps the rest.
