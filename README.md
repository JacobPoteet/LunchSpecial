# 🛎️ Lunch Special

**A daily dish-guessing game set in the golden age of diners.**

**▶ Play it live: https://lunchspecial.app**

[![Rounds played](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3Drounds)](https://lunchspecial.app)
[![Specials solved](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3Dsolved)](https://lunchspecial.app)
[![Solve rate](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3DsolveRate)](https://lunchspecial.app)
[![Results shared](https://img.shields.io/endpoint?url=https%3A%2F%2Flunchspecial.app%2Fapi%2Fstats%2Fbadge%3Fmetric%3Dshared)](https://lunchspecial.app)

<sub>Live engagement, straight from the diner's own [anonymous analytics](#engagement-stats). The badges read the public `/api/stats` endpoint and refresh hourly through shields.io's cache.</sub>

Every day the diner runs one *Special*: a famous dish from somewhere in the world. You get 6 guesses. Each guess (any dish on the menu) reveals which ingredients it shares with the Special and how its country, course, serving temperature, and protein compare. After every miss, the kitchen slips you a clue ticket: country of origin, history, the moment that made the dish famous.

Once today's check is settled, **Leftovers** unlocks: a calendar of every past Special, marked with what you solved and what you missed, so you can replay a day you skipped. **Chef's Choice** deals a no-stakes round on a random dish. The receipt at the end of a round also carries a form to suggest a dish for the menu; suggestions land in an admin inbox, and a dish that reaches the menu that way gets credited on the check. A **note from the kitchen** turns up now and then: a short notice posted from the admin panel, shown once, on Today's Special only.

The same build also runs as a **Discord Activity**, described in [Discord Activity](#discord-activity) below.

Built as a single Cloudflare Worker: React SPA served from Workers Static Assets, Hono API, D1 (SQLite) database.

📄 **[Project breakdown](https://jacobpoteet.github.io/LunchSpecial/)** is the longer write-up: the feedback design, the narrative system behind the clues, the stack, the instrumentation, and what the live numbers say.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite, hand-written CSS (no framework), self-hosted OFL fonts |
| API | [Hono](https://hono.dev) on Cloudflare Workers (`worker/`) |
| Database | Cloudflare D1: dishes, clues, schedule, analytics, visits, announcements, experiments, dish requests (`migrations/`, `seed/`) |
| Dev/build | `@cloudflare/vite-plugin` (Worker runs in workerd during `vite dev`) |
| Discord | `@discord/embedded-app-sdk`, dynamically imported only inside the Activity iframe (`src/discord/`) |
| Tests | Vitest: the pure game engine plus every analytics fold, the announcement/markdown logic, the small-sample statistics, and a catalog data-integrity check (`worker/*.test.ts`, `shared/*.test.ts`) |
| CI/CD | GitHub Actions. A `v*` tag tests, migrates, and deploys the Worker (`deploy.yml`); `ci.yml` runs tests + typecheck on every code push/PR (prose-only changes skip it); `codeql.yml` scans every PR; Dependabot (`dependabot.yml`) keeps dependencies current |

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars       # ADMIN_PASSWORD + SESSION_SECRET
npm run db:migrate && npm run db:seed
npm run dev                          # game at :5173/, admin at :5173/admin
```

`.dev.vars` holds **Worker** secrets; client build-time vars (currently `VITE_DISCORD_CLIENT_ID`) go in a gitignored `.env.local`, modelled on `.env.example`. You need neither to play the game locally. `npm test` runs the unit tests, `npm run check` typechecks everything.

### Debug / testing options

Ways to poke at the game locally without editing the schedule or touching your saved stats:

| Option | What it does |
|---|---|
| `npm run play` | Starts the dev server and opens **`/play`**: a fresh round on a **random dish**, nothing saved. Reload or hit **🎲 New random dish** to roll another. |
| `/play` or `?freeplay` | The same free-play mode by URL (e.g. `http://localhost:5173/play`). |
| `npm run ramen` | The same thing pinned to **one named dish** (Ramen) instead of a random one, for playtesting a specific board, and the finished-round screen, over and over. |
| `?special=<slug>` | The pinned-dish mode by URL (e.g. `http://localhost:5173/play?special=pho`). Any active dish's slug works; add another `npm run <dish>` script for one you reach for often. |
| `npm run admin` | Starts the dev server and opens **`/admin`** straight at the login, skipping the game. |
| Admin **Test play** | From `/admin`, a signed preview link that plays a *specific* dish (see [Admin panel](#admin-panel-admin)). |

A random round sends a seed the API maps to one active dish, so the round holds still and a new seed rolls another. That's the same spoiler-free **Chef's Choice** mode players get in production (never touches the schedule, saves no stats). `?special=<slug>` takes the roll out and names the dish outright, and it's the most throwaway mode of the lot: no localStorage, no lifetime stats, no analytics, honoured by the client in dev only. It exists to rehearse the **end of a round**, so it comes dressed as the daily right down to the check, countdown and share button, with the top banner as the only tell.

## Deploying to Cloudflare

The whole thing (game + API + admin) ships as one free-tier-friendly Worker. It's live, and releases are automated: push a version tag and GitHub Actions tests, typechecks, applies remote D1 migrations, and deploys.

```bash
git tag v1.1.0 && git push origin v1.1.0
```

It also runs on demand from **Actions → Deploy to Cloudflare → Run workflow**. CI authenticates with two GitHub Actions secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`); `ADMIN_PASSWORD` and `SESSION_SECRET` live on the Worker itself and persist across deploys, so CI never touches them. CI **never** runs the seed, which would overwrite dishes edited via `/admin`.

**Production D1 is the only copy of half the data.** The seed and migrations reconstruct the dish *pool* and nothing else. The booked schedule, every admin dish edit, analytics, announcements and experiments live only in production and have no representation in this repo. There is no automatic backup, so take one before any production database work: `npm run db:export:remote` writes a full dump to a gitignored `backups/`, and `npm run db:export:catalog` writes a dishes-and-clues-only dump that's safe to share.

GitHub builds the release changelog from the merged PRs' labels (`.github/release.yml`), so it falls out of the label each PR already carries instead of being written by hand. Dependency updates arrive as grouped weekly Dependabot PRs, and CodeQL runs security/quality analysis on every PR (`.github/workflows/codeql.yml`).

Rebuilding the environment from scratch (already done once, unlikely to be needed again): `wrangler login` → `wrangler d1 create` and paste the id into `wrangler.jsonc` → `db:migrate:remote` + `db:seed:remote` → `wrangler secret put` the two Worker secrets → `npm run deploy` → add the two Actions secrets to arm CI. CLAUDE.md keeps the full record, including which account and token scopes.

## Discord Activity

The game also runs inside Discord as an [Activity](https://discord.com/developers/docs/activities/overview), with **no separate build or deploy**. Discord doesn't host the code; it frames `lunchspecial.app` through its proxy via a URL mapping, so `npm run deploy` ships the public site and the Activity at once.

- **Detection is runtime-only.** `src/discord/bootstrap.ts` looks for the `frame_id` query param Discord adds to the iframe URL. On the open web it's absent, the Embedded App SDK (behind a dynamic import) is never downloaded, and web visitors pay nothing for it.
- **Still anonymous.** The embed completes the SDK handshake and then runs the ordinary game: localStorage state, no accounts. It takes exactly two OAuth scopes, `identify` and `rpc.activities.write`, and drops the user object Discord hands back without reading, storing or sending it. `identify` buys nothing but the handshake: the SDK parses `authenticate()`'s reply against a schema where the user is required, and presence dies without it. (Caveat: localStorage inside Discord is scoped to the `discordsays.com` origin, so Activity players have a separate history from the website.)
- **The check posts to the channel.** The share button draws the score card as a PNG, uploads it through the Worker to Discord's attachment endpoint, and opens `openShareMomentDialog` with the resulting CDN url, so the result lands as a message from the player rather than as a request to go and paste something. The card never names the dish. Every hop can fail, and each failure falls back to the clipboard, which is what Discord players got before this existed. The button reads "📤 Share" until it knows where the result went, then says either "Sent to the channel!" or "Copied — paste it in chat!".
- **The clipboard fallback uses `execCommand`.** `navigator.clipboard` is gated behind a permissions policy Discord's iframe doesn't grant, so a hidden-textarea `document.execCommand("copy")` catches it, needing only a user gesture. If both fail the button shows a retry label, because a share must never fail quietly.
- **Rich Presence shows the round.** The player's profile reads "Playing Lunch Special / Today's Special · No. 26 / Guess 3 of 6", with an elapsed timer for this sitting. The copy is a pure fold in `shared/presence.ts` and never names the dish, the guesses or the clues: a profile is read by people who haven't played today. Updates are throttled to one per 4s with a trailing send, since Discord allows 5 per 20s and a burst would drop the win rather than the noise.
- **One live message per round.** On the player's first guess the app asks Discord to invoke its own application command, and the Worker answers by posting the board, the player's name and face, and a **Play now!** button into the channel they launched from. Every later guess edits that same message, and game over flips it to the past tense. A whole round costs the channel one message. Identity comes off Discord's signed interaction rather than from the browser, `worker/discordsig.ts` verifies the Ed25519 signature against the raw body or returns 401, and the stored row holds an opaque handle and an interaction token that Discord expires after 15 minutes.
- **Three small facts about the room**, none of them taking a scope (`src/discord/social.ts`): an invite button on the check's footer, a count of other players in this Activity instance (the count alone leaves the module, and the bar hides at zero), and a compact layout when Discord draws the app picture-in-picture. `lockPortrait()` also asks for portrait on mobile, since the board is laid out for 375px and the check is the tallest thing in the game.
- Analytics record which **surface** a round came from (`web` or `discord`), which every chart in the admin dashboard can filter by.

Setup is four clicks in the Discord Developer Portal (enable Activities, map `/` → `lunchspecial.app`, add a redirect URI) plus `VITE_DISCORD_CLIENT_ID`, a **public** build-time var rather than a secret. Presence and channel sharing need `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` as Worker secrets, so the OAuth code-for-token hop happens server-side; without them `/api/discord/token` answers 503 and the rest of the game is unaffected. The live progress message needs one more pass: `npm run discord:register` to register the command, the portal's Interactions Endpoint URL pointed at `/api/discord/interactions`, and `DISCORD_PUBLIC_KEY` on the Worker. Discord can't reach `localhost`, so testing in real Discord means `npm run dev` in one terminal and `npm run tunnel` (cloudflared) in another, with the portal's URL mapping pointed at the tunnel.

## How the daily Special works

- The daily Special **rolls over at midnight Eastern Time (`America/New_York`)** for every player. Wherever you are, the puzzle switches at the same moment it switches for everyone else.
- The `schedule` table maps dates to dishes. If a date has no row, the Worker picks a **deterministic fallback** dish from the active pool, so the game never breaks.
- Game state and stats live in `localStorage`, with no accounts anywhere.
- The reveal endpoint is client-initiated after game over (same honesty model as Wordle).

## Engagement stats

The game fires anonymous, fire-and-forget beacons to `/api/rounds/*`, **never carrying any guess content** (`worker/routes/analytics.ts`). Four events:

| Beacon | Written to | Means |
|---|---|---|
| `/seated` | `analytics_visits` | A device opened a real board; one row per device per ET day |
| `/start` | `analytics_rounds` | First guess submitted; the round begins |
| `/complete` | `analytics_rounds` | Game over, with guesses used and whether it was solved |
| `/share` | `analytics_rounds` | The player posted the result |

Every round carries its **kind** (Today's Special / Leftovers / Chef's Choice), its **surface** (web / Discord), the **dish**, and a random per-device player id used only to tell new players from returning ones. Cloudflare resolves the **country** at the edge and the Worker stamps it on write; the client never sends it, and nothing stores an IP. Two ways to read the numbers back:

- **Admin dashboard**: six tabs, each holding one question rather than one data source. Today (live service), Menu (what's served and how it lands), Players (funnel, retention, new-vs-returning, country), Trends (growth, weekday/hour rhythm), Experiments (before/after for logged changes), Activity (the raw beacon feed). Every tab is web/Discord filterable, and the day slice takes a calendar picker. Login required.
- **Public totals**: `GET /api/stats` returns aggregate-only counts:

  ```json
  { "dishes": 351, "rounds": 745, "completed": 650, "solved": 537, "shared": 104, "avgGuesses": 3.15 }
  ```

  `GET /api/stats/badge?metric=rounds|solved|solveRate|shared` returns the same numbers in [shields.io's endpoint schema](https://shields.io/badges/endpoint-badge), which powers the badges at the top of this README. `GET /api/stats/breakdown` returns one consolidated, edge-cached payload (guess distribution, per-mode and per-surface splits, the device-based funnel, days-played survival curve, and the cumulative growth series) that the [project breakdown page](https://jacobpoteet.github.io/LunchSpecial/) charts live. Aggregate-only throughout; nothing exposes a per-player row.

**Endpoint naming is a precaution.** These paths were originally `/api/analytics/*`. The *admin* feed at `/api/admin/analytics/events` failed for blocked clients, showing a bare `NetworkError` in the browser with nothing in the Worker logs, which is why it's now `/api/admin/recent-rounds`. I renamed the player beacons at the same time on the same reasoning, but never measured that half either way: they're fire-and-forget, so a blocked beacon looks exactly like a delivered one, and no before/after change in volume showed up. Treat it as cheap insurance rather than a fixed bug, and avoid `analytics`, `event`, `track`, `collect`, `beacon`, `telemetry`, `pixel`, `visit`, or `view` in a client-called URL.

## Admin panel (`/admin`)

Password login (Worker secret + HMAC-signed session cookie, 7 days). `npm run admin` starts the dev server and opens it straight away, the way `npm run play` does for a round. Five sections plus a test-play escape hatch:

- **Dashboard**: today's Special and the countdown to the next one, schedule health (warns under 7 days ahead), content warnings (dishes missing clues/ingredients), and the six engagement tabs described above
- **Dishes**: searchable/filterable table; per-dish editor with canonical-ingredient tag input, 5 ordered clues, a fan-submission credit flag, and a **live player preview**
- **Schedule**: upcoming board, assign/swap/clear days, **auto-fill 30 days** (least-recently-served, no repeats within 60 days), past days locked
- **Announcements**: write, schedule and retire the notices players see; limited markdown (bold/italic/link only), audience of everyone or returning players, plus per-notice reach
- **Requests**: inbox of player-suggested dishes (badge = pending count); review, remove, or open one prefilled in a new dish editor
- **Test play**: signed preview link that opens the real game against any dish without touching daily state or stats

The Activity tab also carries **This device's data**: a review of everything this browser has recorded across rounds, visits and notice views, and a button to delete it. The admin is also a player, and at this volume one person play-testing is a visible fraction of every rate on the dashboard.

## Content model

- `dishes`: name, country, region (drives the yellow "close" country match), course, hot/cold, protein, JSON array of canonical ingredients, fan-submission flag
- `clues`: 5 per dish, ordered vague → specific (region hint → origin → famous moment → key ingredient → near-giveaway)
- `schedule`: `date (YYYY-MM-DD) → dish_id`
- `dish_requests`: player suggestions, an inbox kept deliberately separate from the `dishes` catalog
- `announcements` + `announcement_views`: notices and who they reached
- `experiments`: one row per deliberate change, recording what shipped, when, and the metric it was meant to move
- `analytics_rounds` + `analytics_visits`: the engagement beacons described above

Ingredient names are canonical (lowercase, singular: `tomato`, not `tomatoes`) so matches line up across dishes. The admin tag input autocompletes against the existing pantry to keep it that way.

The catalog ships two ways: `seed/seed.sql` is the canonical, idempotent snapshot used for local setup, and each batch of new dishes also gets an additive migration so releases can extend the live database without clobbering edits made in `/admin`. A data-integrity test guards both against bad enum values and dishes missing clues or ingredients.


## Also in this repo

- [`docs/`](docs/): the [project breakdown page](https://jacobpoteet.github.io/LunchSpecial/), published with GitHub Pages
- [`public/`](public/): press kit (`/press`) and the Privacy Policy / Terms pages (`/privacy`, `/terms`) required for Discord verification
- [`discord-assets/`](discord-assets/): source + build script for the Activity's store art
