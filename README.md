# 🛎️ Lunch Special

**A daily dish-guessing game set in the golden age of diners.**

**▶ Play it live: https://lunch-special.jacobwilliampoteet.workers.dev**

Every day the diner runs one *Special* — a famous dish from somewhere in the world. Players get 6 guesses. Each guess (any dish on the menu) reveals which ingredients it shares with the Special and how its country, course, serving temperature, and protein compare. After every miss, the kitchen slips you a clue ticket: country of origin, history, the moment that made the dish famous.

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
