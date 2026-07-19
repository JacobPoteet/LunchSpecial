# 🛎️ Lunch Special

**A daily dish-guessing game set in the golden age of diners.**

**▶ Play it live: https://lunchspecial.app**

[![Rounds played](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3Drounds)](https://lunchspecial.app)
[![Specials solved](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3Dsolved)](https://lunchspecial.app)
[![Solve rate](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3DsolveRate)](https://lunchspecial.app)
[![Results shared](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3Dshared)](https://lunchspecial.app)

<sub>Live engagement, straight from the diner's own [anonymous analytics](#engagement-stats) — the badges refresh from the public `/api/stats` endpoint (updates hourly via shields.io's cache).</sub>

Every day the diner runs one *Special* — a famous dish from somewhere in the world. Players get 6 guesses. Each guess (any dish on the menu) reveals which ingredients it shares with the Special and how its country, course, serving temperature, and protein compare. After every miss, the kitchen slips you a clue ticket: country of origin, history, the moment that made the dish famous.

Finished today's check? Open the **Menu Archive** — a calendar of every past Special, marked with what you've solved and what you missed — and replay any day you skipped. Or have the cook fire a **random recipe** for a no-stakes round on a dish picked at random.

Built as a single Cloudflare Worker: React SPA served from Workers Static Assets, Hono API, D1 (SQLite) database.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite, hand-written CSS (no framework), self-hosted OFL fonts |
| API | [Hono](https://hono.dev) on Cloudflare Workers (`worker/`) |
| Database | Cloudflare D1 — dishes, clues, schedule (`migrations/`, `seed/`) |
| Dev/build | `@cloudflare/vite-plugin` (Worker runs in workerd during `vite dev`) |
| Tests | Vitest (pure game engine in `worker/game.ts`) |
| CI/CD | GitHub Actions — push a `v*` tag to test, migrate, and deploy the Worker automatically (`.github/workflows/deploy.yml`) |

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars       # set ADMIN_PASSWORD + SESSION_SECRET
npm run db:migrate                   # create tables in local D1
npm run db:seed                      # 68 dishes, 340 clues, 30 scheduled days
npm run dev                          # http://localhost:5173
```

- Game: `http://localhost:5173/`
- Admin: `http://localhost:5173/admin` (password = `ADMIN_PASSWORD` from `.dev.vars`)

`npm test` runs the game-engine unit tests; `npm run check` typechecks everything.

### Debug / testing options

Ways to poke at the game locally without editing the schedule or touching your saved stats:

| Option | What it does |
|---|---|
| `npm run play` | Starts the dev server and opens **`/play`** — a fresh round on a **random dish**, nothing saved. Reload or hit **🎲 New random dish** to roll another. |
| `/play` or `?freeplay` | The same free-play mode by URL (e.g. `http://localhost:5173/play`). |
| Admin **Test play** | From `/admin`, a signed preview link that plays a *specific* dish (see [Admin panel](#admin-panel-admin)). |

Under the hood a random seed is sent to the API and mapped to an active dish deterministically — one round stays on a single dish, while a new seed rolls a new one. This is the same **random recipe** ("cook's choice") players can launch from the Menu Archive in production; it's spoiler-free (it never touches the schedule) and saves nothing. The `/play` and `?freeplay` entrances above are dev conveniences (client behind `import.meta.env.DEV`) that drop you straight into a random round on load.

## Deploying to Cloudflare

The app is live and deploys automatically. The whole thing (game + API + admin) ships as one Worker — free-tier friendly.

### Releases (automated)

Push a version tag and GitHub Actions handles the rest — test, typecheck, apply remote D1 migrations, deploy:

```bash
git tag v1.1.0 && git push origin v1.1.0
```

You can also run it on demand from **Actions → Deploy to Cloudflare → Run workflow**. CI authenticates with two GitHub Actions secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`); the Worker secrets below live on the Worker and persist across deploys, so CI never touches them. The seed is **never** run in CI — it would overwrite dishes edited via `/admin`.

### First-time setup (one-off)

1. `npx wrangler login`
2. `npx wrangler d1 create lunch-special-db` → copy the returned id into `database_id` in `wrangler.jsonc`
3. `npm run db:migrate:remote && npm run db:seed:remote`
4. `npx wrangler secret put ADMIN_PASSWORD` and `npx wrangler secret put SESSION_SECRET` (use a long random string)
5. `npm run deploy` for the first manual deploy, then add the two GitHub Actions secrets to arm CI

## How the daily Special works

- The player's **local date** decides which puzzle they see (Wordle-style). The server accepts dates within ±2 days of UTC.
- The `schedule` table maps dates to dishes. If a date has no row, a **deterministic fallback** dish is picked from the active pool so the game never breaks.
- Game state and stats live in `localStorage` — no accounts.
- The reveal endpoint is client-initiated after game over (same honesty model as Wordle).

## Engagement stats

The game fires anonymous, fire-and-forget beacons — one row per round (start, completion, share) keyed by a client-generated id, **never any guess content** (`worker/routes/analytics.ts`, `analytics_rounds` table). Two ways to read them back:

- **Admin dashboard** — full breakdown: guess distribution, fail count, and the last 30 days (login required).
- **Public totals** — `GET /api/stats` returns aggregate-only counts:

  ```json
  { "rounds": 12450, "completed": 9000, "solved": 6300, "shared": 1200 }
  ```

  `GET /api/stats/badge?metric=rounds|solved|solveRate|shared` returns the same numbers in [shields.io's endpoint schema](https://shields.io/badges/endpoint-badge), which is what powers the badges at the top of this README.

## Admin panel (`/admin`)

Password login (Worker secret + HMAC-signed session cookie, 7 days). Four areas:

- **Dashboard** — today's Special, schedule health (warns under 7 days ahead), content warnings (dishes missing clues/ingredients)
- **Dishes** — searchable/filterable table; per-dish editor with canonical-ingredient tag input, 5 ordered clues, and a **live player preview**
- **Schedule** — upcoming board, assign/swap/clear days, **auto-fill 30 days** (least-recently-served, no repeats within 60 days), past days locked
- **Test play** — signed preview link that opens the real game against any dish without touching daily state or stats

## Content model

- `dishes` — name, country, region (drives the yellow "close" country match), course, hot/cold, protein, JSON array of canonical ingredients
- `clues` — 5 per dish, ordered vague → specific (region hint → origin → famous moment → key ingredient → near-giveaway)
- `schedule` — `date (YYYY-MM-DD) → dish_id`

Ingredient names are canonical (lowercase, singular: `tomato`, not `tomatoes`) so matches line up across dishes. The admin tag input autocompletes against the existing pantry to keep it that way.

## Art & fonts

**All current art is AI-generated placeholder work, tagged for replacement** — every asset is named `ai-*.svg` and carries an `AI-GENERATED PLACEHOLDER` comment. See [ASSETS.md](ASSETS.md) for the full manifest an artist can work from. Fonts (Alfa Slab One, Yellowtail) are SIL OFL, self-hosted in `src/assets/fonts/`.
