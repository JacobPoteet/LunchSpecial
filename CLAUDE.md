# CLAUDE.md — Lunch Special

Daily Wordle-style game: guess the diner's "Special" (a world dish). 1950s diner theme. One Cloudflare Worker serves everything: React SPA (Workers Static Assets) + Hono API + D1. No accounts; player state in localStorage.

## Commands

```bash
npm run dev          # vite dev (Worker runs in workerd via @cloudflare/vite-plugin), http://localhost:5173
npm test             # vitest — worker/game.test.ts only
npm run check        # tsc -b (3 project refs: app / worker / node)
npm run build        # tsc -b && vite build → dist/
npm run deploy       # build + wrangler deploy
npm run db:migrate   # apply migrations to LOCAL D1   (db:migrate:remote for prod)
npm run db:seed      # run seed/seed.sql on LOCAL D1  (db:seed:remote for prod)
npm run cf-typegen   # regenerate worker-configuration.d.ts after wrangler.jsonc changes
```

Local admin password: `ADMIN_PASSWORD` in `.dev.vars` (gitignored; currently `lunchboss`). Browser preview: `.claude/launch.json` has server name `lunch-special`.

## Deploy to Cloudflare

### One-time bootstrap (manual — touches the CF account + secrets)

1. `npx wrangler login` (already logged in as jacobwilliampoteet@gmail.com)
2. `npx wrangler d1 create lunch-special-db` → paste returned UUID into `database_id` in wrangler.jsonc (currently a placeholder of zeros). Commit it — DB ids are not secret.
3. `npm run db:migrate:remote && npm run db:seed:remote` (seed once, by hand — see CI note below)
4. Set the two Worker secrets directly (interactive prompt — you type the value; run in your own terminal): `npx wrangler secret put ADMIN_PASSWORD` then `npx wrangler secret put SESSION_SECRET` (a long random string, e.g. `openssl rand -hex 32`). They persist across deploys, so CI never touches them.
5. First deploy by hand to confirm it works: `npm run deploy` → lunch-special.<subdomain>.workers.dev
6. Verify: play a guess on the live URL, log into /admin

### Where secrets live

- **Worker secrets** (`ADMIN_PASSWORD`, `SESSION_SECRET`): set directly on the Worker via `wrangler secret put`. They live on the Worker and persist across deploys, so CI never needs them.
- **CI credentials** (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`): stored as **GitHub Actions secrets** (Settings → Secrets and variables → Actions).
  - `CLOUDFLARE_API_TOKEN` — a CF API token with the "Edit Cloudflare Workers" template scope + D1:Edit
  - `CLOUDFLARE_ACCOUNT_ID` — `9016037cfaa0836d9bbc85d754935cb5`

### Automated releases (CI)

`.github/workflows/deploy.yml` deploys on any pushed tag matching `v*` (and via manual "Run workflow"). It runs `npm test` + `npm run check`, applies remote D1 migrations, then `npm run deploy`. Cut a release with:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

CI runs migrations (idempotent, additive) but **never** the seed — `seed/seed.sql` DELETEs and re-inserts every dish, which would wipe admin edits. Seed only by hand, once, during bootstrap.

Note: the vite plugin writes a build-processed config into dist/; plain `wrangler deploy` from the repo root picks it up (the `deploy` script already chains build first).

## Layout

```
wrangler.jsonc        assets SPA fallback + run_worker_first:["/api/*"] + D1 binding "DB"
migrations/0001_init.sql   dishes / clues / schedule tables
seed/seed.sql         68 dishes, 5 clues each, 30-day schedule from 2026-07-17. Idempotent (DELETEs first)
shared/types.ts       ALL shared types + enums (COURSES, REGIONS…) + MAX_GUESSES + EPOCH_DATE
worker/index.ts       Hono entry; only /api/* reaches the Worker (assets serve the rest)
worker/game.ts        PURE game logic (feedback, puzzleNumber, date validation, fallback pick) — unit tested
worker/auth.ts        HMAC tokens: session cookie + preview tokens (stateless, SESSION_SECRET-signed)
worker/db.ts          row mapping, getTargetDish (schedule row else deterministic fallback), utcToday
worker/routes/public.ts   /api/dishes, /daily, /guess, /reveal — never leak target except via /reveal
worker/routes/admin.ts    /api/admin/*: login/logout/session, dish CRUD, ingredients vocab,
                          schedule GET/PUT, autofill, preview token, dashboard
src/App.tsx           path startsWith /admin → lazy AdminApp, else GamePage (no router lib)
src/api.ts            public fetch wrappers + localToday()
src/game/             GamePage (orchestrator), components.tsx (Modal/GuessRow/ClueTicket/GuessInput/Countdown),
                      storage.ts (localStorage round+stats), share.ts (emoji grid)
src/admin/            AdminApp (session+nav), api.ts, Dashboard, DishList, DishEditor (live preview reuses
                      game components), ScheduleView
src/styles/           base.css (tokens/fonts), game.css, admin.css — hand-written CSS, BEM-ish, no framework
src/assets/art/       ai-*.svg = AI placeholder art (keep the AI-GENERATED header comment); fonts = OFL
```

## Game rules (server-enforced shapes in shared/types.ts)

- 6 guesses; clue N returned by POST /guess after miss N (N=1..5, from `clues.order_index`)
- Feedback: ingredient set intersection + 4 attribute tiles. Country: hit=same country, near=same `region`, miss. Course/temperature/protein: hit|miss
- Date = player's LOCAL date string (YYYY-MM-DD); server accepts ±2 days of UTC now. Puzzle #1 = 2026-07-17 (EPOCH_DATE)
- Unscheduled date → deterministic FNV-hash pick from active dishes (game never 404s)
- `?preview=<token>` on /, /daily, /guess, /reveal = admin test play; skips schedule, localStorage, and stats
- Reveal is client-initiated after game over (Wordle trust model — don't "fix" this)

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
