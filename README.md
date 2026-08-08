# 🛎️ Lunch Special

**A daily dish-guessing game set in the golden age of diners.**

**▶ Play it live: https://lunchspecial.app**

[![Rounds played](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3Drounds)](https://lunchspecial.app)
[![Specials solved](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3Dsolved)](https://lunchspecial.app)
[![Solve rate](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3DsolveRate)](https://lunchspecial.app)
[![Results shared](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3Dshared)](https://lunchspecial.app)

<sub>Live engagement, straight from the diner's own [anonymous analytics](#engagement-stats) — the badges refresh from the public `/api/stats` endpoint (updates hourly via shields.io's cache).</sub>

Every day the diner runs one *Special* — a famous dish from somewhere in the world. Players get 6 guesses. Each guess (any dish on the menu) reveals which ingredients it shares with the Special and how its country, course, serving temperature, and protein compare. After every miss, the kitchen slips you a clue ticket: country of origin, history, the moment that made the dish famous.

Finished today's check? Open **Leftovers** — a calendar of every past Special, marked with what you've solved and what you missed — and replay any day you skipped. Or order **Chef's Choice** for a no-stakes round on a dish picked at random. Think something's missing from the menu? The receipt at the end of a round has a form to suggest a dish, which lands in an admin inbox.

The same build also runs as a **Discord Activity** — see [Discord Activity](#discord-activity) below.

Built as a single Cloudflare Worker: React SPA served from Workers Static Assets, Hono API, D1 (SQLite) database.

📄 **[Project breakdown](https://jacobpoteet.github.io/LunchSpecial/)** — a longer write-up of the feedback design, the stack, and what the live numbers say about difficulty.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite, hand-written CSS (no framework), self-hosted OFL fonts |
| API | [Hono](https://hono.dev) on Cloudflare Workers (`worker/`) |
| Database | Cloudflare D1 — dishes, clues, schedule, analytics, dish requests (`migrations/`, `seed/`) |
| Dev/build | `@cloudflare/vite-plugin` (Worker runs in workerd during `vite dev`) |
| Discord | `@discord/embedded-app-sdk`, dynamically imported only inside the Activity iframe (`src/discord/`) |
| Tests | Vitest — pure game engine, badge/stats + analytics-breakdown assembly, and a catalog data-integrity check (`worker/*.test.ts`) |
| CI/CD | GitHub Actions — a `v*` tag tests, migrates, and deploys the Worker (`deploy.yml`); `ci.yml` validates catalog data on PRs that touch it; `codeql.yml` scans every PR; Dependabot (`dependabot.yml`) keeps dependencies current |

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars       # set ADMIN_PASSWORD + SESSION_SECRET
npm run db:migrate                   # create tables in local D1
npm run db:seed                      # 283 dishes, 1,415 clues, 30 scheduled days
npm run dev                          # http://localhost:5173
```

- Game: `http://localhost:5173/`
- Admin: `http://localhost:5173/admin` (password = `ADMIN_PASSWORD` from `.dev.vars`)

`.dev.vars` holds **Worker** secrets. Client build-time vars (currently just `VITE_DISCORD_CLIENT_ID`) go in a gitignored `.env.local` — see `.env.example`. Neither is needed to play the game locally.

`npm test` runs the unit tests; `npm run check` typechecks everything.

### Debug / testing options

Ways to poke at the game locally without editing the schedule or touching your saved stats:

| Option | What it does |
|---|---|
| `npm run play` | Starts the dev server and opens **`/play`** — a fresh round on a **random dish**, nothing saved. Reload or hit **🎲 New random dish** to roll another. |
| `/play` or `?freeplay` | The same free-play mode by URL (e.g. `http://localhost:5173/play`). |
| `npm run ramen` | The same thing pinned to **one named dish** (Ramen) instead of a random one — for playtesting a specific board, and the finished-round screen, over and over. |
| `?special=<slug>` | The pinned-dish mode by URL (e.g. `http://localhost:5173/play?special=pho`). Any active dish's slug works; add another `npm run <dish>` script for one you reach for often. |
| Admin **Test play** | From `/admin`, a signed preview link that plays a *specific* dish (see [Admin panel](#admin-panel-admin)). |

Under the hood a random seed is sent to the API and mapped to an active dish deterministically — one round stays on a single dish, while a new seed rolls a new one. This is the same **Chef's Choice** round players can launch from Leftovers in production; it's spoiler-free (it never touches the schedule) and saves no local stats. The `/play` and `?freeplay` entrances above are dev conveniences (client behind `import.meta.env.DEV`) that drop you straight into a random round on load.

`?special=<slug>` is the same idea with the roll taken out: the slug names the dish outright. It's a testing tool, so it's the most throwaway mode of all — no localStorage, no lifetime stats, and (unlike a random round) no analytics either. The client honours it in dev only.

Because it's mostly used to look at the **end of a round**, it's dressed as the daily on the way there: today's real Special number, and a finished-round check with the countdown, share button, stats panel and **📅 Play again** exactly where the daily puts them. The banner at the top is the only tell. Two seams are on purpose — the stats panel shows the numbers you started with (the round wasn't recorded), and sharing copies a real score card without logging a share.

## Deploying to Cloudflare

The app is live and deploys automatically. The whole thing (game + API + admin) ships as one Worker — free-tier friendly.

### Releases (automated)

Push a version tag and GitHub Actions handles the rest — test, typecheck, apply remote D1 migrations, deploy:

```bash
git tag v1.1.0 && git push origin v1.1.0
```

You can also run it on demand from **Actions → Deploy to Cloudflare → Run workflow**. CI authenticates with two GitHub Actions secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`); the Worker secrets below live on the Worker and persist across deploys, so CI never touches them. The seed is **never** run in CI — it would overwrite dishes edited via `/admin`.

The release's changelog is generated from the merged PRs' labels (`.github/release.yml`), so it falls out of the label each PR already carries rather than being written by hand. Dependency updates arrive as grouped weekly Dependabot PRs, and CodeQL runs security/quality analysis on every PR (`.github/workflows/codeql.yml`).

### First-time setup (one-off)

1. `npx wrangler login`
2. `npx wrangler d1 create lunch-special-db` → copy the returned id into `database_id` in `wrangler.jsonc`
3. `npm run db:migrate:remote && npm run db:seed:remote`
4. `npx wrangler secret put ADMIN_PASSWORD` and `npx wrangler secret put SESSION_SECRET` (use a long random string)
5. `npm run deploy` for the first manual deploy, then add the two GitHub Actions secrets to arm CI

## Discord Activity

The game also runs inside Discord as an [Activity](https://discord.com/developers/docs/activities/overview) — **no separate build or deploy**. Discord doesn't host the code; it frames `lunchspecial.app` through its proxy via a URL mapping, so `npm run deploy` ships the public site and the Activity at once.

- **Detection is runtime-only.** `src/discord/bootstrap.ts` looks for the `frame_id` query param Discord adds to the iframe URL. On the open web it's absent, the Embedded App SDK (behind a dynamic import) is never downloaded, and web visitors pay nothing for it.
- **Anonymous, same as the web.** The embed completes the SDK handshake and then runs the ordinary game — localStorage state, no OAuth, no accounts. (Caveat: localStorage inside Discord is scoped to the `discordsays.com` origin, so Activity players have a separate history from the website.)
- **Sharing posts to the channel.** In the embed the receipt's share button calls `shareLink()` with the same emoji grid the web build builds, and Discord's own modal posts it as the player — the iframe has neither Web Share nor clipboard access, so this replaces that path rather than falling back to it.
- Analytics record which **surface** a round came from (`web` or `discord`), which the admin dashboard can filter by.

Setup is four clicks in the Discord Developer Portal (enable Activities, map `/` → `lunchspecial.app`, add a redirect URI) plus `VITE_DISCORD_CLIENT_ID` — a **public** build-time var, not a secret. Discord can't reach `localhost`, so testing in real Discord means `npm run dev` in one terminal and `npm run tunnel` (cloudflared) in another, with the portal's URL mapping pointed at the tunnel.

## How the daily Special works

- The daily Special **rolls over at midnight Eastern Time (`America/New_York`)** for every player, regardless of where they are, the same puzzle switches for everyone at the same moment.
- The `schedule` table maps dates to dishes. If a date has no row, a **deterministic fallback** dish is picked from the active pool so the game never breaks.
- Game state and stats live in `localStorage` — no accounts.
- The reveal endpoint is client-initiated after game over (same honesty model as Wordle).

## Engagement stats

The game fires anonymous, fire-and-forget beacons to `/api/rounds/*` — one row per round (start, completion, share) keyed by a client-generated id, **never any guess content** (`worker/routes/analytics.ts`, `analytics_rounds` table). Rounds are tagged with their **kind** (Today's Special / Leftovers / Chef's Choice), their **surface** (web / Discord), and a random per-device player id used only to tell new players from returning ones. Two ways to read them back:

- **Admin dashboard** — full breakdown: guess distribution, fail count, hourly and daily activity, new-vs-returning players, a web/Discord filter, a calendar picker for any past day, and a feed of the individual events behind the charts (login required).
- **Public totals** — `GET /api/stats` returns aggregate-only counts:

  ```json
  { "rounds": 12450, "completed": 9000, "solved": 6300, "shared": 1200 }
  ```

  `GET /api/stats/badge?metric=rounds|solved|solveRate|shared` returns the same numbers in [shields.io's endpoint schema](https://shields.io/badges/endpoint-badge), which is what powers the badges at the top of this README.

## Admin panel (`/admin`)

Password login (Worker secret + HMAC-signed session cookie, 7 days). `npm run admin` starts the dev server and opens it straight away, the way `npm run play` does for a round. Four tabs plus a test-play escape hatch:

- **Dashboard** — today's Special and the countdown to the next one, schedule health (warns under 7 days ahead), content warnings (dishes missing clues/ingredients), and the engagement panel described above
- **Dishes** — searchable/filterable table; per-dish editor with canonical-ingredient tag input, 5 ordered clues, and a **live player preview**
- **Schedule** — upcoming board, assign/swap/clear days, **auto-fill 30 days** (least-recently-served, no repeats within 60 days), past days locked
- **Requests** — inbox of player-suggested dishes (badge = pending count); review, remove, or open one prefilled in a new dish editor
- **Test play** — signed preview link that opens the real game against any dish without touching daily state or stats

## Content model

- `dishes` — name, country, region (drives the yellow "close" country match), course, hot/cold, protein, JSON array of canonical ingredients
- `clues` — 5 per dish, ordered vague → specific (region hint → origin → famous moment → key ingredient → near-giveaway)
- `schedule` — `date (YYYY-MM-DD) → dish_id`
- `dish_requests` — player suggestions, an inbox kept deliberately separate from the `dishes` catalog

Ingredient names are canonical (lowercase, singular: `tomato`, not `tomatoes`) so matches line up across dishes. The admin tag input autocompletes against the existing pantry to keep it that way.

The catalog ships two ways: `seed/seed.sql` is the canonical, idempotent snapshot used for local setup, and each batch of new dishes also gets an additive migration so releases can extend the live database without clobbering edits made in `/admin`. A data-integrity test guards both against bad enum values and dishes missing clues or ingredients.


## Also in this repo

- [`docs/`](docs/) — the [project breakdown page](https://jacobpoteet.github.io/LunchSpecial/), published with GitHub Pages
- [`public/`](public/) — press kit (`/press`) and the Privacy Policy / Terms pages (`/privacy`, `/terms`) required for Discord verification
- [`discord-assets/`](discord-assets/) — source + build script for the Activity's store art