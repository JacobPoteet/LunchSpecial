# CLAUDE.md — Lunch Special

Daily Wordle-style game: guess the diner's "Special" (a world dish). 1950s diner theme. One Cloudflare Worker serves everything: React SPA (Workers Static Assets) + Hono API + D1. No accounts; player state in localStorage.

**This file is instructions, not documentation.** It carries what a change has to obey. The reasoning behind any of it — why a fold is shaped this way, what an audit found, which experiment settled a question — is in the wiki. See "Documentation" at the bottom.

## Commands

```bash
npm run dev          # vite dev (Worker runs in workerd via @cloudflare/vite-plugin), http://localhost:5173
npm run play         # vite dev + opens /play: a fresh round on a RANDOM dish, nothing saved (dev-only free play)
npm run ramen        # same, but pinned to one named dish (/play?special=ramen) — playtest a specific board
npm run lastcall     # THE HAND-OFF HARNESS: seeds a finished, won Special from the real reveal
                     # endpoint, so the page opens on the check with After Dark's band already live.
                     # Pressing it runs the real lights-out sweep into a real Nightcap
npm run afterdark    # straight into a Nightcap on a RANDOM pour, opening hours ignored.
                     # Rolled pours are ephemeral, so a restarted server always starts clean
npm run negroni      # ...pinned to one named drink instead (?nightcap=negroni)
npm run admin        # vite dev + opens /admin: straight to the login, skipping the game (password below)
npm test             # vitest — worker/**/*.test.ts + shared/**/*.test.ts (every pure fold has one)
npm run check        # tsc -b (3 project refs: app / worker / node)
npm run a11y         # axe over the RUNNING game (needs `npm run dev` in another terminal).
                     # Plays a round first — the tiles and chips don't exist on an empty board
npm run build        # tsc -b && vite build → dist/
npm run deploy       # build + wrangler deploy
npm run db:migrate   # apply migrations to LOCAL D1   (db:migrate:remote for prod)
npm run db:seed      # run seed/seed.sql on LOCAL D1  (bootstrap only — see warning below)
npm run db:export:remote    # dump PROD D1 → backups/prod-full-<stamp>.sql (gitignored). Take one before any prod DB work
npm run db:export:catalog   # same, but dishes+clues+schedule only — no player data, safe to diff against seed.sql
npm run db:export           # local DB, all tables
npm run cf-typegen   # regenerate worker-configuration.d.ts after wrangler.jsonc changes
npm run discord:register    # one-time: register the /progress application command (needs DISCORD_APP_ID + DISCORD_BOT_TOKEN)
npm run tunnel       # cloudflared quick tunnel → :5173, for testing inside real Discord
```

Local admin password: `ADMIN_PASSWORD` in `.dev.vars` (gitignored; currently `lunchboss`). Browser preview: `.claude/launch.json` has server name `lunch-special`.

## Deploy to Cloudflare

**Live:** https://lunchspecial.app (custom domain on the Worker). Bootstrap is done and releases are automated.

### One-time bootstrap (only for a fresh environment)

`npx wrangler login` → `npx wrangler d1 create lunch-special-db` (paste the UUID into `database_id` in wrangler.jsonc and commit it; DB ids are not secret — prod is `f331205d-c816-48c9-b099-0fb15b7605ba`) → `npm run db:migrate:remote && npm run db:seed:remote` → `npx wrangler secret put ADMIN_PASSWORD` and `SESSION_SECRET` (interactive; run in your own terminal) → `npm run deploy` → verify a guess and an /admin login on the live URL.

### Where secrets live

- **Worker secrets** (`ADMIN_PASSWORD`, `SESSION_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_PUBLIC_KEY`, `GITHUB_TOKEN`): set with `wrangler secret put`. They persist across deploys, so CI never touches them. The Discord ones are **optional** — without them every deployment still runs, minus Rich Presence and the channel share (`/api/discord/token` answers 503). `GITHUB_TOKEN` is optional too — without it the back office's issue composer says so instead of showing the form.
- **Not a secret: `GITHUB_REPO`**, a plain `vars` entry in wrangler.jsonc (`JacobPoteet/LunchSpecial`). A public repo name is worth being greppable. `VITE_DISCORD_CLIENT_ID` is the other public one, and it's a build-time Vite var rather than a Worker var — see the Discord section.
- **CI credentials**: GitHub Actions secrets. `CLOUDFLARE_API_TOKEN` ("Edit Cloudflare Workers" template + D1:Edit), `CLOUDFLARE_ACCOUNT_ID` = `9016037cfaa0836d9bbc85d754935cb5`.
- **`DISCORD_BOT_TOKEN`** is used by `npm run discord:register` and nowhere else. It is not a Worker secret and nothing in the running app has one.

### Automated releases (CI)

| Workflow | Fires on | Does |
|---|---|---|
| `ci.yml` | push + PR to `main` | **test** job: `npm test` → `npm run check`. **a11y** job (parallel): local D1 migrate + seed → start `npm run dev` → `npm run a11y` |
| `codeql.yml` | push + PR to `main`, weekly cron (Mon 04:27 UTC) | security-and-quality scan |
| `deploy.yml` | `v*` tag, or manual dispatch | test + check + remote D1 migrate + deploy |

```bash
git tag v1.1.0 && git push origin v1.1.0
```

Four things to keep true:

- `ci.yml` and `codeql.yml` share an identical `paths-ignore` (`**.md`, `docs/**`, `discord-assets/**`). **Keep the two lists in sync** — Actions doesn't support YAML anchors. **If CI ever becomes a required status check, `paths-ignore` will hang doc-only PRs on "Expected — waiting for status"**; switch to an always-running gate job at that point.
- `worker-configuration.d.ts` and the `Env` secret members are generated from `.dev.vars`, both gitignored, so both workflows regenerate types and write a placeholder `.dev.vars` **derived from the committed `.dev.vars.example`** before typechecking. **A new Worker secret must be added to `.dev.vars.example`**, or CI can't see it and `tsc` fails.
- `deploy.yml` re-runs test + check on purpose. The deploy gate shouldn't trust that CI passed on some earlier commit.
- CI runs migrations (idempotent, additive) but **never** the seed.

### Prod D1 is the only copy of half the data

`seed.sql` + `migrations/` reconstruct the dish **pool** and nothing else. The `schedule` (booked in /admin — **never add `INSERT INTO schedule` rows**), every admin dish edit, `analytics_rounds`, `analytics_visits`, `dish_requests`, `announcements`, `experiments` and `sound_prefs` live **only** in prod D1. Divergence between the dashboard and `seed.sql` is expected and correct, not drift to reconcile.

1. **`npm run db:seed:remote` is destructive.** Its `DELETE FROM schedule` steps around the FK that would otherwise block the dish wipe, so a stray run replaces every hand-booked Special with the stock 30-day block and reverts all admin edits.
2. **There is no automatic backup.** Run `npm run db:export:remote` before any prod DB work. Dumps land in gitignored `backups/`; full dumps carry anonymous `player_id` UUIDs, so use `db:export:catalog` for anything you'd share.

The vite plugin writes a build-processed config into `dist/`; plain `wrangler deploy` from the repo root picks it up (the `deploy` script chains build first).

## Discord Activity

The game also runs as a **Discord Activity** (embedded iframe app) — **no separate build**. Discord frames `lunchspecial.app` through its proxy via a root URL mapping, so `npm run deploy` ships both. The only Discord-specific client code is `src/discord/`, activated at runtime.

Why it needs no proxy gymnastics: the app is same-origin and self-contained. All client calls are relative `/api/*`, all assets/fonts/art are Worker-served, no CDNs.

**Detection and boot.** `isDiscordActivity()` checks for the `frame_id` query param Discord adds. On the open web it's absent, `initDiscord()` returns null, and the Embedded App SDK (behind a **dynamic import**) is never downloaded. `src/main.tsx` awaits `initDiscord()` before mounting React; embedded, it completes the SDK `ready()` handshake and the game then runs **anonymously** exactly as on the web.

> **The 5s `ready()` cap must not gate anything but the mount.** It only decides *when React mounts*, so a stalled handshake doesn't white-screen the iframe. `attachPresence` / `attachShare` / `attachSocial` are called inside the handshake's own `.then()`, never on the branch that wins the race — doing the latter silently killed the share button on every slow Activity start.

### Rules that hold across the Discord code

- **Never name the dish** in presence copy or on the score card. Both are read by people who haven't played today. Progress and guess counts are safe; the answer, the guessed dishes and the clues are not. `shared/presence.ts` has a test asserting the fold's whole output space stays inside a character class no dish name can survive.
- **Two OAuth scopes, `identify` + `rpc.activities.write`, and both are required.** Measured, not assumed: presence on one scope alone is dead, and that experiment is finished — **don't re-run it, and don't add a third**. `identify` is what the SDK's `authenticate()` hop needs. **The user object it returns is dropped on the floor** — never read, stored, sent to the Worker, or written to localStorage. Don't start reading it.
- **The token exchange is server-side** (`worker/routes/discord.ts`). The client secret must never reach the browser. Unconfigured deployments answer **503**, and nothing may ever wait on a Discord feature.
- **Authorize once per page load, whatever happens.** `prompt: "none"`; a refusal or broken exchange sets `unavailable` and is never retried. A consent sheet mid-round is worse than no presence.
- **Nothing here may fail loudly.** Presence throttles to one update per 4s with a trailing send (Discord's limit is 5 SET_ACTIVITY per 20s); the progress message retires its loop on one failure rather than retrying; a 410 retires it silently.
- **The presence elapsed timer measures this sitting and is dropped once the round ends.** A board restored from localStorage was begun on a page load we no longer have.
- Preview and playtest publish nothing, gated on the same `tracked` flag as the beacons.

### Sharing the check to the channel

Three hops in `src/discord/share.ts`: draw the score card as a PNG → `POST /api/discord/attachment` → `sdk.commands.openShareMomentDialog({ mediaUrl })`.

- **The clipboard fallback is the whole safety argument.** `shareToChannel()` never throws and returns a boolean; `ResultModal.share()` copies on false. Trying and failing is never worse than not trying.
- **`openShareMomentDialog` accepts a Discord CDN URL and nothing else**, which is why the card is a picture. Content is a pure fold in `shared/scorecard.ts`, drawn by `src/game/scorecard.ts`.
- **Tiles are drawn as rects, not emoji**, and the palette is hard-coded from base.css rather than read at draw time. The image outlives the stylesheet.
- **The upload goes through the Worker** and needs no new scope or bot token: Discord's attachment endpoint takes a user bearer of any scopes. The Worker stores nothing — no token, no image.
- **Sharing never raises a consent sheet.** `canShareToChannel()` reads `peekToken()`, never `ensureAuthorized()`.
- **`copyShareText()` falls back to a hidden-textarea `document.execCommand("copy")`.** `navigator.clipboard` is gated behind a permissions policy Discord's iframe doesn't grant, so the modern API alone rejects there. It returns a boolean and the button shows a retry label on false — never let a share fail silently.
- **Don't reach for `sdk.commands.shareLink`.** Tried, reverted, kept erroring in practice.

### The live progress message

On the player's **first guess** the app posts one message into the launch channel (name, face, a picture of the board, a **Play now!** button); every guess after that **edits that same message**, and the round ending flips its text to the past tense. Client half `src/discord/progress.ts`, server half `/api/discord/interactions` + `/api/discord/progress`.

- **The message is created by Discord, not by us.** `shareInteraction({ command: "progress", …, require_launch_channel: true })` asks Discord to invoke our application command; Discord posts a signed interaction back.
- **Identity comes off Discord's signed payload, never the client**, so a player can't make the app announce somebody else. `worker/avatar.ts` builds the URL and **Discord fetches the picture** — no avatar bytes pass through this app. Default avatars index off the snowflake (`(id >> 22) % 6`, **BigInt** — `Number` rounds and collapses everyone onto one face); animated `a_` hashes must be requested as `.gif`.
- **Edits never re-send `embeds`.** Discord replaces embeds wholesale, so the author line is written once at creation and left alone, while `content` and `attachments` are patched independently. That is the mechanism that keeps `discord_messages` (migrations/0022) down to `{opaque handle, interaction token, created_at}`. Put the name in `content` and you would have to store it.
- **The handle is client-minted, opaque and bounded** (16 bytes of hex, `HANDLE_PATTERN`). Not the user id, not the channel. The row expires because Discord kills interaction tokens at 15 minutes.
- **The interaction token never reaches the browser.** It is permission to post as this app in someone's server.
- **Verify the signature or don't answer.** `worker/discordsig.ts` checks the **raw** body — re-serializing parsed JSON changes the signed message and fails every request. Discord validates a newly-saved endpoint by sending a deliberately bad signature and requiring a 401, so a 401 there is a passing grade.
- **Updates are trailing, not queued.** The message shows a *position*, so three guesses landing during an upload should show the third.
- **`resetProgress()` must stay declared above the publisher in GamePage.** Effects fire in order; a board restored from localStorage publishes on mount, and resetting afterwards orphans that post.
- **`shareInteraction` is undocumented.** Every field is read off its zod schema. If it breaks, the manual share button still works and only the loop is lost.

### The room the game is in (`src/discord/social.ts`)

No OAuth scopes, all no-ops off Discord.

- **Invite dialog** on a `replay-btn` in the check's footer. Hidden when `sdk.guildId === null` (DMs throw `INVALID_CHANNEL`); a missing permission gets a swallowed error rather than a pre-flight check, which would cost a third scope to pre-empt one failure.
- **"3 others are at the counter"** via `getActivityInstanceConnectedParticipants()` + an `ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE` subscription. **Only the count leaves the module** — the payload carries usernames, avatars and nicknames, and reading any of them would put identity into a game that has none. **You are subtracted, and the bar hides at zero.**
- **PIP layout** stamps `<html data-discord-layout="pip">` and game.css does the rest. **Scoped to the attribute, never a width query** — a tile and a narrow phone share a width but not a situation. See the wiki's Responsive and Accessibility note for what survives.
- **Portrait lock** on mobile via `setOrientationLockState` on handshake (no scope; desktop ignores it). PIP and grid lock states are deliberately unset.

### Leave the footer's side pages alone

`/privacy`, `/terms` and `/press` are plain same-origin links with no `target="_blank"`. They navigate the iframe and Discord's proxy serves them, and each page carries its own "← Back to the diner". `openExternalLink` was tried and doesn't apply — nothing in the game opens a new tab, and **the game has no outbound links at all**. If one ever appears, that's the moment to reach for it.

### Config and setup

- **Client ID:** `VITE_DISCORD_CLIENT_ID`, a **public** build-time Vite var. Ships in the bundle; **not** a secret; do not put it in `.dev.vars`. Local dev: `.env.local`. CI: a repo Actions **Variable**.
- **localStorage caveat:** inside Discord it's sandboxed to the `discordsays.com` origin, so Activity players have a **separate** game history from lunchspecial.app.
- **Portal (manual, one-time):** create app → Client ID into `VITE_DISCORD_CLIENT_ID` → enable Activities → URL Mapping `/` → `lunchspecial.app` → an OAuth2 redirect URI (`https://127.0.0.1` is fine) → `wrangler secret put DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`. For the progress message: `npm run discord:register`, set the Interactions Endpoint URL to `https://lunchspecial.app/api/discord/interactions`, and put `DISCORD_PUBLIC_KEY` on the Worker.
- **Dev testing inside real Discord:** Discord can't reach localhost. `npm run dev` + `npm run tunnel`, then point the portal's URL Mapping at the printed `*.trycloudflare.com` URL. (`cloudflared` installed separately.)

## After Dark

A second daily puzzle behind the first: one **drink** a night, **4 guesses**, **3 coasters**, between **20:00 and 03:00 on the player's own clock**. The lights go down, the palette swaps, and it's gone by morning. `docs/index.html` owns the vocabulary — the *Nightcap* (Night #N), a *coaster* (the bar's clue ticket), the *tab* (the bar's check), and *Libations* (the card heading, where the diner's says Today's Menu). **After Dark is the mode, not the menu**: it names the glowing marquee and nothing else on the board, because a heading that repeats the sign two inches under it is a heading doing no work.

### The clock is the only genuinely new idea

Everything else in the game rolls over at midnight ET for everyone. After Dark deliberately breaks that, and the break is contained in **`shared/night.ts`** — nothing outside it decides when the bar is open or which night a round belongs to, and every fold takes the clock as an argument rather than reading one (same rule `shared/build.ts` follows about `__BUILD__`).

- **The night key is the local calendar day the evening began on.** Hours 00:00–02:59 belong to the night before, which is the whole reason this isn't a date string: a round begun at 23:50 and finished at 00:10 is one sitting on one drink.
- **It is fixed at entry and never recomputed.** Recomputing would hand a player who starts at 02:55 tomorrow's board mid-round, and recomputing at midnight would do it to everybody.
- **Last call is a door, not a timer.** The window governs whether the *entrance* appears. A round in progress at 03:00 runs to completion — nothing is wired to kill a live board on a clock tick.
- **The Worker can't know a player's local time and doesn't try.** `isPlayableNight` checks the claimed night is within ±1 day of ET's, which covers every real UTC offset. Same posture, and the same worst case (a wound-forward clock gets tomorrow's drink early), as `isAllowedRequestDate`'s ±2 on the daily.
- **`NIGHT_EPOCH_DATE` must be on or before the day this ships.** A future epoch closes the bar completely, because `isPlayableNight` refuses anything earlier than it. That is not hypothetical; a launch-dated epoch did exactly this in testing.

### The door

**Gated on finishing today's Special**, the way the archive unlocks. Say so plainly on the closed sign — a locked door with no reason on it is the most annoying screen in any game. The gate is also what makes the crossover metric exact: everyone in its denominator could have walked through.

- The invite is **its own band under the check's replay row, never a fourth button in it** — the check is the tallest card in the game at 375px.
- It **fades in a beat after the check settles**, not with it. Someone reading their result gets to finish reading it; that delay is the difference between an offer and an interruption.
- It **turns on live**: a player who finished at 19:58 with the check open sees it at 20:00 (`useBarInvite` polls, like `useNewDayAvailable`).
- A **toolbar pill** on the board covers the returning player who finished lunch at noon and shouldn't have to reopen their check to find the bar.
- **`soon` is a sentence, not a disabled button.** There is nothing to press yet, and a control that becomes enabled in two hours is worse than a line of copy.
- **Nothing about the bar happens until the band is pressed.** No auto-navigation, ever.

### Drinks are their own tables

`drinks` / `drink_clues` / `drink_schedule` (migrations 0039–0040), never a `kind` column on `dishes`. The deciding argument is the failure mode: about ten queries read the dish pool as `WHERE is_active = 1` with no kind filter, retrofitting `AND kind='dish'` onto all of them works right up until someone adds the eleventh, and you find out when a Negroni goes out as Tuesday's lunch Special.

- **Two tiles differ.** `course` says nothing when every row is a drink and no drink has a `protein`, so the four are **country · spirit · temperature · profile**. Country keeps the three-state near-match; the other three are hit/miss.
- **`spirit: 'none'` is a value, not an absence** — two mocktails match each other.
- **`is_alcoholic` is stored, never derived from `spirit`.** Beer and wine have no base spirit and are very much alcoholic; arak is `other` and so is kava. There is a test pinning that pair.
- **The pool is held between 55% and 75% alcoholic** by `worker/data-integrity.test.ts`, because the mix is a design decision rather than an accident of what got written. It ships at 28/40.
- **Pool only in migrations. Never `INSERT INTO drink_schedule`** — same rule as `schedule`. An unbooked night runs on the deterministic fallback pour and never 404s.
- **The ingredient vocabulary is pooled with the kitchen's.** A bar and a kitchen share a pantry, and two spellings of one ingredient means the feedback under-reports for everything holding either.

### The coaster sheet

Three coasters, one per miss, because four guesses means at most three misses — a fourth row could never print and the writer would still have to fill it. **Not the five-beat sheet with two beats deleted:** it folds origin and build into one middle beat. The names, jobs and budgets live once in `shared/clues.ts` (`COASTER_BEATS`), imported by both the linter and the admin editor's live counter.

| # | Beat | The handle it hands over |
|---|---|---|
| 1 | **The room** | The region, and what kind of drink is in the glass. Never the country |
| 2 | **The pour** | Who mixed it and what goes in. Two sentences allowed; it is the only one |
| 3 | **Last call** | The country, and what it looks like in front of you |

Every hard rule from the dish beat sheet applies unchanged — banned openers, praise, hedges, the one-name-word cap, no em dashes, the five-word phrase rule. `lintClue` takes the sheet it is reading against rather than being forked, because a forked copy is how the drinks catalogue quietly stops enforcing the banned-praise list six months from now.

### Sharing both grids

The tab shares the **night's grid and the lunch grid above it**. It can, because the door is finishing lunch: by the time anyone can press it, both rounds exist and both are theirs.

- **Night tiles keep the same three states with a black miss** (`⬛` not `⬜`), and the pantry glyph is `🥃` with `🥂` for the winning pour. One swap, so a channel with both pasted into it stays legible without a second legend.
- **A share is attributed to the card you pressed it on.** The combined message fires the *nightcap* round's share beacon and leaves the lunch round's `shared` flag alone — marking both would inflate a figure the dashboard already reads, from an action taken hours later on a different screen.
- `joinShareBlocks` stacks them and `shareMessage` appends the url **once, to the whole message**. Both grid folds are url-free for that reason and live in `shared/share.ts` (they never touched a browser and were the only untested part of the share path).
- `RoundState.ingredientCount` is stamped on every saved lunch round so the tab can redraw that grid from storage alone. The guess rows only carry each *guess's* matched count, which is a lower bound and not the number.

### The theme is a token swap

`<html data-after-dark>` (precedent: `data-discord-layout="pip"`), and `base.css` redefines the tokens under `:root[data-after-dark]`. Every component inherits and none needed touching — there is no bar-specific copy of a guess row, which is what stops the two boards drifting.

- **Scoped to the attribute, never a media query.** This is a place in the game, not a device preference: a player on a dark-mode phone is not at the bar, and a player at the bar in daylight is.
- **Measure the surface as it is PAINTED, not the token.** `.menu-card` laid a 35% near-white gradient over `--paper` and `.guess-row` a 75% one, so a card whose token read `#1d1714` actually painted `#6e6962` and every guess row came out near-white. The tokens were right and the board still looked washed out. `--paper-sheen`, `--paper-stipple` and `--row-fill` are tokens now for that reason: **a theme cannot swap what a rule hardcodes.**
- **`--hit` stays at the daytime value.** A lighter green separated better from the dark card and dropped white text under 4.5:1, and the tile's text is the half that has to be readable.
- **`--paper-edge` is a hairline, not a frame** (the card's frame is `--cherry-dark`). It has to be *lighter* than what it sits on: a guess row is read by its border and not its fill, so darkening it erased the rows. Daytime separates row from card by 1.04 and its border by 1.36; the night edge is tuned to 1.41.
- `--on-hit` / `--on-near` / `--paper-bright` replaced literal hexes. That is the third literal-hex contrast failure this codebase has had and the third time the fix was to name the pair. **Check contrast before picking a colour, and never paint a one-off hex where a token belongs.**
- `npm run a11y` scans three bar states. Run it after any change to the night palette — a token swap changes every pair at once, and the only cheap way to know they all still clear is to measure them on the painted page.

### What the dashboard must not do with a Nightcap

`kind = 'nightcap'` is a fourth `RoundKind`, and **two columns change meaning under it**: `play_date` holds the LOCAL night key rather than an ET day, and `guesses` is out of four rather than six.

- **Never pool a Nightcap with a Special on either.** A "won in 4" out of four and a "won in 4" out of six are different achievements and one x-axis cannot hold both. Every guess distribution and every guesses-average in `routes/admin.ts` and `routes/stats.ts` excludes `nightcap`; the bar's own distribution is four wide and lives on its own tab. Counts (rounds, completed, solved) pool fine.
- **`tz_offset` is the only beacon field that is a fact about the player's clock.** Without it the hour profile can only be drawn in ET, where every player's 9pm lands in a different bucket and the shape is noise. Coarser than the country already on every row; re-validated server-side like `source`, and an impossible offset is dropped to NULL — a gap reports as unmeasured, a bad value reports as a place nobody lives.
- **The After Dark tab has no day picker.** The bar's unit is a local night; pointing an ET day picker at it would be the dashboard telling a small lie every time somebody used it.
- **The crossover's denominator is devices that *finished* a Special**, not devices that visited, and it counts devices rather than rounds. One known gap, documented at the query: a player who starts *lunch* between midnight and 03:00 gets the Special dated D+1 while still being out on night D, so that pairing is missed. Closing it would mean pairing each night with two ET days, which double-counts the ordinary case to rescue the rare one.
- **After Dark takes `--neon-pink` in the kind palette.** A fourth value inside an existing meaning, not a fifth meaning — the four palettes (kind, event, rank, annotation) are unchanged.

### Testing the bar

The clock and the door are both awkward to reach on purpose, so there are four ways past them and only one of them exists in production:

- **`npm run lastcall`** is the hand-off harness. It seeds a finished, won Special from the *real* reveal endpoint, so the check, the grid and the board underneath show a coherent round, and everything after that point is the genuine flow.
- `npm run afterdark` / `?barhours=off` ignores opening hours; `npm run negroni` / `?nightcap=<slug>` pins the pour. All dev-only on the client, exactly like `?special=`.
- **`?nightcap=random` rolls a different pour on every load**, which is what makes the flow re-testable: a rolled pin is ephemeral like any other, so nothing is written and a restarted dev server never hands back the board you just played. "random" is not a slug — the *client* resolves it against `/api/night/drinks` and hands the ordinary pin path a real one, so **the Worker never learns a random branch**. That matters: one drink a night with no archive is the shape of the mode, and a branch that exists for testing is a branch that eventually ships. It is also why `DrinkPoolEntry` carries a slug and `DrinkSummary` does not.
- **The drink preview token (`preview:drink:<id>`, from the Bar section or the nightly board) is the only way past the clock in production**, and the only one that is untracked. That is the point: the bar is open seven hours a night and "does the tab look right" is a two-in-the-afternoon question. The daily's resolver rejects a drink token and vice versa.


## Layout

```
wrangler.jsonc        assets SPA fallback + run_worker_first:["/api/*"] + D1 binding "DB"
migrations/           0001_init.sql = dishes/clues/schedule. Additive only. 0041 is the latest
seed/seed.sql         canonical dish AND drink catalogues + a 30-day schedule from 2026-07-17 and a
                      30-night block from NIGHT_EPOCH_DATE. Idempotent (DELETEs first)
shared/types.ts       ALL shared types + enums (COURSES, REGIONS, SPIRITS, PROFILES…) + MAX_GUESSES
                      + DRINK_MAX_GUESSES + EPOCH_DATE + NIGHT_EPOCH_DATE
worker/index.ts       Hono entry; only /api/* reaches the Worker (assets serve the rest)
worker/game.ts        PURE game logic (feedback, puzzleNumber, date validation, fallback pick)
worker/auth.ts        HMAC tokens: session cookie + preview tokens (stateless, SESSION_SECRET-signed)
worker/db.ts          row mapping, getTargetDish (schedule row else deterministic fallback), serverToday
worker/drinkdb.ts     the same for drinks. Separate so neither can be aimed at the other's table
worker/nightcap.ts    PURE drink feedback (country/spirit/temperature/profile + ingredients)
```

**Every module below is a pure fold with a unit test beside it.** Query in the route, fold in the module, assert on the fold.

```
worker/menu.ts        menu mix (schedule × dishes → region/course/protein ratios)
worker/announcements.ts   notice status, audience eligibility, input validation
worker/service.ts     per-day folds (UTC hour buckets → ET hour profile, totals, pace baseline,
                      open-round split, solve-time median/p90, capped play time)
worker/growth.ts      all-time growth (hour buckets → zero-filled ET-day series + least-squares trend)
worker/countries.ts   country mix ((country, player) rows → one country per device + untracked)
worker/attribution.ts arrival source (visit rows → devices per utm_source + censored return rate)
worker/rhythm.ts      weekday × hour (7×24 heat grid + both marginals)
worker/dishstats.ts   per-dish performance (win rate / guesses / DNF / shares)
worker/experiments.ts all-time daily series (zero-filled raw per-ET-day rows)
worker/funnel.ts      player funnel (per-device stages)
worker/players.ts     repeat visits (foldRetention)
worker/device.ts      one device's rows, the review shown before a wipe
worker/shuffle.ts     the unserved-dish pick behind the Tomorrow's Special shuffle
worker/stats.ts       public-badge folds (shields.io endpoint payload, compact counts, breakdown)
worker/nightstats.ts  After Dark's own reads: night service, four-wide distribution, LOCAL hour
                      profile, boozy/sober split, per-drink report, and the crossover
worker/discordsig.ts  Ed25519 check that an interaction came from Discord (raw body!)
worker/github.ts      issue composer folds (repo string, input validation, the posted body,
                      GitHub's JSON → our shapes). No fetch — the route does the talking
worker/avatar.ts      Discord avatar url + display name (default faces, animated hashes)
worker/data-integrity.test.ts   the clue linter. Enforces the beat sheet's mechanizable half. Fails in CI

shared/clues.ts       the five beats, their names, jobs, character budgets and sentence caps —
                      one copy, imported by the linter and by the admin editor's live counter
shared/markdown.ts    inline-markdown tokenizer for announcements (bold/italic/link → tokens, never HTML)
shared/audio.ts       sound registry + mix + the guess-arc timing table + AUDIO_DEFAULTS per surface
shared/presence.ts    Discord Rich Presence copy. Never the dish
shared/scorecard.ts   shareable score card (round → title/subtitle/tile rows). Never the dish
shared/share.ts       share target choice (capabilities → sheet or clipboard) + the one message
shared/sample.ts      Wilson intervals, SMALL_SAMPLE_MIN, weighted median/percentile, separated()
shared/attribution.ts utm_source normaliser + SOURCE_DIRECT
shared/experiment.ts  before/after comparison — windowing, pooled rates, verdicts, "how many more days"
shared/dishfilter.ts  admin dish-list query — facet matching, facet counts, rest days, sorts, normalize
shared/schedule.ts    the admin specials board — schedule window × catalogue → rows with dish meta,
                      nearest-other-serving gap; board gap summary; name → dish; picker search
shared/activity.ts    activity feed (rounds + arrivals + day totals → round states, durations, visits)
shared/announce.ts    the guess-feedback wording, one table feeding colour, glyph and screen reader
shared/night.ts       the After Dark clock — night key, the 20:00-03:00 window, last call,
                      night numbering, and what the Worker will accept. The ONE place the
                      game's fixed-ET rollover is deliberately broken
shared/time.ts        GAME_TIMEZONE (America/New_York), gameToday, msUntilGameMidnight, daysBetween,
                      addDays (one copy — the worker routes and src/game/archive.ts both import it)
shared/build.ts       the build marker's wording (BuildInfo → label / title). Takes the info as an
                      argument and never reads __BUILD__ — see the marker note in Conventions

worker/routes/nightcap.ts /api/night/*: drinks pool, info, guess, reveal. Its own router because
                          the two modes share no table, clue count or guess ceiling — and above
                          all no pool
worker/routes/discord.ts  /token (OAuth hop), /attachment (score-card PNG), /interactions (signed
                          callbacks, Ed25519-verified or 401), /progress (patch the live message)
worker/routes/public.ts   /api/dishes, /daily, /guess, /reveal — never leak target except via /reveal
                          + /announcements, /announcements/seen, /requests
worker/routes/stats.ts    /api/stats — public, no auth, aggregate-only, sends Access-Control-Allow-Origin: *
                          /api/stats/breakdown — edge-cached 600s in caches.default
                          /api/stats/badge?metric=rounds|solved|solveRate|shared — shields.io schema
worker/routes/analytics.ts  the beacon handlers, mounted at /api/rounds/* (see "Beacon paths" below)
worker/routes/admin.ts    /api/admin/*: login/logout/session, dish CRUD, ingredients vocab, schedule
                          GET/PUT, autofill, schedule/shuffle, preview token, dashboard, analytics
                          aggregates + /recent-rounds, /menu-mix, /dish-report, /device-data GET+DELETE,
                          /experiments CRUD, /announcements CRUD, /issues GET+POST

src/audio/            engine.ts = the Web Audio graph (two buses, buffer cache, gesture unlock, audio-clock
                      scheduling); music.ts = the ambient bed; prefs.ts = the mute pref; index.ts = the
                      public API everything outside src/audio/ imports
src/assets/sfx/, music/   empty until licensed; a missing file is a silent sound, not an error
src/discord/          bootstrap.ts = frame_id detect + SDK ready + portrait lock + sticky iframe params
                      auth.ts = the one authorize-per-page-load and the token it yields
                      presence.ts · progress.ts · share.ts · social.ts (see above)
src/App.tsx           path startsWith /admin → lazy AdminApp, else GamePage (no router lib)
src/api.ts            public fetch wrappers + localToday()
src/game/             NightPage (the bar board), night.ts (the browser's half of the clock),
                      LightsOut.tsx (the walk there), devHarness.ts (dev-only entrances),
                      roundLifecycle.ts (the end-of-round choreography, shared by both boards)
src/game/             GamePage (orchestrator), components.tsx (Modal/GuessRow/ClueTicket/GuessInput/
                      Countdown), SoundToggle.tsx, storage.ts, share.ts, attribution.ts,
                      ArchiveModal.tsx + archive.ts, AnnouncementModal.tsx + Markdown.tsx, scorecard.ts,
                      BuildTag.tsx (the always-on build marker)
src/admin/            BarView (drink list + editor + nightly board), AfterDarkPanel (the 7th tab)
src/admin/            AdminApp (session+nav), api.ts, IssueComposer, Dashboard (7 tabs), OverviewPanel, DishReportPanel,
                      MenuMixPanel, PlayersPanel, TrendsPanel, ExperimentsPanel, ActivityPanel
                      (+ MyDataPanel), RequestsView, AnnouncementsPanel, analyticsUi.tsx, DayPicker,
                      DishList, DishEditor, ScheduleView
src/styles/           base.css (tokens/fonts), game.css, admin.css — hand-written CSS, BEM-ish, no framework
src/assets/art/       ai-*.svg = AI placeholder art (keep the AI-GENERATED header comment); fonts = OFL
```

## Game rules

- **6 guesses.** Clue N is returned by `POST /guess` after miss N (N=1..5, from `clues.order_index`).
- **Feedback:** ingredient set intersection + 4 attribute tiles. Country: hit = same country, near = same `region`, miss. Course / temperature / protein: hit|miss.
- **Reveal is client-initiated after game over** (Wordle trust model — don't "fix" this).
- **Unscheduled date** → deterministic FNV-hash pick from active dishes, so the game never 404s.

### Dates and the daily rollover

The puzzle date rolls over at **midnight ET (`America/New_York`) for everyone**, not the browser's local midnight and not UTC. `gameToday()` in shared/time.ts is used by both client (`localToday`) and worker (`serverToday`); both the player's "Next Special in …" and the admin's "Switches in …" use `msUntilGameMidnight`.

The server accepts a **playable date**: today (±2 days of ET now, for clock and rollover slack) or any earlier puzzle back to `EPOCH_DATE`. Future dates beyond that window are rejected so upcoming Specials aren't spoiled. `isPlayableDate` = `isAllowedRequestDate` ∪ `isArchiveDate` in worker/game.ts. Puzzle #1 = 2026-07-17.

### Round modes

| Mode | Entry | localStorage | Lifetime stats | Analytics | Reads `schedule` |
|---|---|---|---|---|---|
| Today's Special | `/` | yes | yes | `daily` | yes |
| Leftovers (archive) | `?date=<past>` | per-date | **no** | `leftover` | yes |
| Chef's Choice | `?random=<seed>` | no | no | `random` | **no** |
| Preview | `?preview=<token>` | no | no | **none** | no |
| Playtest | `?special=<slug>` | no | no | **none** | no |

- **Archive** unlocks once today's Special is finished; the calendar shows every puzzle EPOCH→today with per-day status. Rounds persist per-date in `lunch-special:archive`. See `src/game/ArchiveModal.tsx` + archive.ts + storage.ts.
- **Preview** is admin test play, minted by `POST /api/admin/preview` (24h TTL), reachable from the Today tab's Special card, each schedule row, and "Save + test play" in the dish editor. **It is the one mode that records nothing** — `tracked` is false, so no beacon fires and it can't move any dashboard figure. That's why the dashboard links to a preview token rather than to `/`.
- **Chef's Choice** is spoiler-free (never touches `schedule`), so it ships in prod. Nothing gates it server-side; dev keeps `/play` and `?freeplay` as convenience entrances.
- **Playtest** pins a dish by slug (`getDishBySlug`, resolved in `resolveTarget` ahead of `random`). The worker takes `?special=` unconditionally (slugs are already public via `/api/dishes`), but **the client only honours it behind `import.meta.env.DEV`**. An unknown slug 400s onto the closed-kitchen sign.
- **Preview and playtest are dressed as the daily** — real puzzle number, "Daily Special" line, countdown, share button, stats panel, 📅 Play again (`dressedAsDaily` in GamePage, taken by the check as `asDaily`). Only the top banner marks them, because the end-of-round screen is the part most worth trying before players reach it. Finishing one unlocks the archive. Two seams are deliberate: the stats panel shows the numbers you walked in with, and the share button copies a real grid but fires no beacon.

### Sharing a finished round

**Which target runs is only settled at click time, so the idle label names none of them.** It reads "📤 Share" everywhere and the *result* says where the round went.

| Surface | Target | Result label |
|---|---|---|
| Desktop web | clipboard (`copyShareText`) | "Copied!" |
| Mobile web | `navigator.share({ text })` | "Shared!" |
| Discord Activity | channel post, clipboard fallback | "Sent to the channel!" / "Copied — paste it in chat!" |

1. **The whole message travels in one field, never `text` + `url`.** Windows' share sheet hands each target whichever field it understands, and most take the url and drop the text. A single string can't be half-delivered. `buildShareText` therefore stays url-free, which is also what lets `shared/scorecard.ts` draw the same score as a picture.
2. **`navigator.share` existing is not the question.** Desktop Chrome and Edge have it, and what it opens is an OS dialog offering to mail the result to somebody.
3. **The phone test is a coarse *primary* pointer** — `pointer`, deliberately not `any-pointer`, which is also true of a touchscreen laptop. `canShare()` is consulted where it exists; **its absence is not a refusal**, or older phones get stranded on the clipboard.
4. **The heuristic may be wrong in both directions without losing the grid.** Preserve that property if it's ever retuned, and keep it a media query rather than a user-agent table.
5. **Every success confirms.** A dismissed sheet (`AbortError`) returns to idle and is correctly silent. `playSfx("share-success")` fires off the resulting state, not inside the dispatcher.

`shareLabel()` in GamePage.tsx is the one place the wording lives. Target choice is `wantsNativeShare` in shared/share.ts; `canUseNativeShare` in src/game/share.ts is the half that reads `navigator`. `ResultModal.share()` is the dispatcher.

### Beacon paths are blocker-bait — keep them boring

The engagement beacons POST to `/api/rounds/seated|start|complete|share`; the admin feed reads `/api/admin/recent-rounds`. They were originally `/api/analytics/*` and `/api/admin/analytics/events`, which ad blockers match by pattern. The admin one failed loudly (a bare `NetworkError`, nothing in the Worker logs); the **player beacons failed silently**, since fire-and-forget means a blocked beacon is indistinguishable from a delivered one and those players simply never appeared in any count.

**Never put `analytics`, `event`, `track`, `collect`, `beacon`, `telemetry`, `pixel`, `visit`, `view` or `pageview` into a client-called URL.** The last three are why the arrival beacon is `/seated`. (`/api/stats` is fine — shields.io fetches it server-side, no browser involved.) `request()` in src/admin/api.ts translates a rejected `fetch` into a "check your ad/content blocker" message for the same reason.

### What the beacons carry

- **`player_id`**: an anonymous, stable per-device UUID in `localStorage` (`lunch-special:player`, via `getPlayerId()`). Anonymous device count only, no accounts. **Only `/start` binds it**, so a round whose start beacon was lost has no device and belongs to no visit — those collect into one "Unattributed" group per day, never quietly attributed to anyone.
- **`kind`**: `daily` | `leftover` | `random`. Set on insert only.
- **`surface`**: `web` | `discord`, resolved once via `currentSurface()` (the `frame_id` signal). Set on insert only; pre-0009 rows default to `web`. Because mode switches navigate by assigning a URL, **Discord's iframe params are captured into sessionStorage on first load and re-attached by `surfaceUrl()`** — skipping either made Chef's Choice and Leftovers log as `web` inside Discord.
- **`country`**: stamped **server-side** from `request.cf.country` (CF-IPCountry as fallback), plus Cloudflare's `T1` and `XX`. No IP is stored and the client sends nothing, so there's nothing to spoof.
- **`dish_id`**: set on insert by `resolveDishId`. A `random` dish is never in the `schedule`, so the client sends `seed` on the start/complete beacons for the server to resolve. Pre-0012 rows fall back to the schedule-by-date join.
- **`source`**: the `utm_source`, on the **visit** row, and **the only client-supplied field on any beacon that starts in a URL the player controls — so the Worker re-normalises whatever the client sends, always.** It rides in the body, not the URL, because `?utm_source=` is a shape blockers match. Captured by `visitSource()` into **sessionStorage, never localStorage**: persisting it would re-attribute every future visit from that browser to an ad clicked weeks ago.
- **Visits** (`POST /api/rounds/seated`): one row per device per ET day, fired when a real tracked board is ready. **Two ledgers, and neither is sufficient alone:** `markSeated()` (sessionStorage, keyed on the ET day) decides whether to *send*; `PRIMARY KEY (visit_day, player_id)` decides what to *count*. The insert stays `ON CONFLICT DO NOTHING`, so **first touch of the day wins**.

### Rules the dashboard obeys

The reasoning for all of these is in the wiki (Honest Numbers, Metrics Reference). These are the ones a change has to keep.

- **Never report "unmeasured" as zero.** `visited: null` means the beacon hadn't shipped; reporting 0 would claim a 100% bounce rate for the game's whole history. Pre-0018 rounds are `untracked`, never a country slice. Rounds with a NULL `dish_id` are `untracked`, never assigned to a dish. A NULL `source` means "recorded before this shipped"; an untagged arrival stores the literal `SOURCE_DIRECT`. `FinishRate` omits its top row on unmeasured days rather than drawing an empty one.
- **Every rate off a denominator under `SMALL_SAMPLE_MIN` (30) carries its Wilson 95% interval, and nothing else does.** Wilson, not the normal approximation, which returns a zero-width interval at rates pinned near 0 or 1. **Don't quote a new percentage without deciding which side of that line you're on.**
- **A headline refuses to compare when it can't.** The dish report, the arrival-source table and the experiment verdicts all gate on `separated()` (deliberately conservative). "Too early to tell" is a verdict, not an absence, and every undecided one carries `daysNeeded`.
- **Censored denominators.** Repeat visits and arrival-source return rates only count a device once `RETENTION_WINDOW_DAYS` (7) have passed since the visit being measured. The rest are reported as `pending`, never as no-shows. Without it a busy week lowers retention and a campaign lowers its own score with every click it buys.
- **Rates are pooled over a period, never averaged across days.** A one-round Tuesday must not outvote a weekend. That's also why the experiment series ships **raw counts** — a pre-divided percentage can't be re-pooled over a different window.
- **The metric is named when an experiment is logged**, and reading a different one prints a warning. Counts get a two-sample t against the pooled spread; rates get non-overlapping Wilson intervals. The ship day counts as "after", and the after-window is clipped at today.
- **Thin cohorts are flagged inline, not hidden**, but a *prose* headline is suppressed until the sample clears its floor (`RETENTION_MIN_COHORT` 10, `DISH_MIN_COMPLETED` 8, `GROWTH_TREND_MIN_DAYS` 7, `WEEKDAY_MIN_OCCURRENCES` 3). A row can quote 1-of-1 because it prints its denominator; a sentence can't.
- **Broken measurements are dropped, never clamped.** Negative durations (a late `/start`) are dropped by `foldSolveTimes` and `foldActivity`. `PLAYTIME_CAP_MINUTES` (15) only ever *reduces*, and `capped` rides along so the trim is stated rather than hidden. A ratio over 100% stays honest; only the bar is clamped.
- **A duration needs both ends measured.** `completedAt`/`sharedAt` are never COALESCEd onto `updated_at`; those rounds light the pip and say "time not recorded". An abandoned round gets no duration at all — now-minus-start measures how long ago it happened, not how long anyone played.
- **Median and p90, never a mean**, for solve time. A round is a browser tab.
- **Weekday figures are averages per occurrence, never totals**, and a weekday that came around and recorded nothing is in the denominator. The heatmap's zero is an empty cell, not the palest step.
- **Devices are partitioned, one country each** (`foldCountries` assigns the country a device played most from, ties broken by code, so the fold doesn't depend on row order). Slices that sum to more than the whole are a lie the pie's shape tells. Rounds are printed beside every slice, because rounds-per-device is the bot tell.
- **Count the right unit, and name it.** The funnel counts **devices** at every stage; `FinishRate` counts **games**. The two coexist on purpose — Today counts games (the right unit for a service), Players counts people (the right unit for a funnel). Don't merge them, and don't "fix" `FinishRate` into a funnel. The same rule governs the `playRate` metric, which skips any day missing either count.
- **The funnel's "played again" is ordered against the earlier finish**: the day's last `started_at` must beat its first completion. Two boards opened in two tabs is not somebody coming back for seconds.
- **`DNF_GRACE_MINUTES` (2h)** splits "still eating" from "walked out", everywhere it's asked.
- **The activity feed's row is a round, not a beacon**, grouped into visits by device × ET day. Rounds group by `playedDay` (the ET day they were *played*), **never** by `play_date`. Visits are fetched by ET day from the oldest round's day, since a visit precedes its first guess. Two counts, meaning different things: what's in view, and what the device really did that day.
- **Retention and the funnel are always folded against the real `today`**, never the picked day.
- **Nothing on the dashboard animates.** `src/styles/admin.css` declares no keyframes, which is why it needs no reduced-motion block at all. Keep it that way. "Serving" refetches every 30s with a static rail a timer removes.
- **`sound_prefs` is not a measurement of anyone's audio experience** and nothing may quote a rate off it. It takes no `EXPERIMENT_METRICS` entry. `toggles` comes from the client (`excluded`, not `+ 1`).

### Colour on the dashboard

Four meanings, already taken. Don't add a fifth without retiring one.

| Palette | Means |
|---|---|
| mustard / teal / cherry | game **kind** (daily / leftover / random) |
| start teal · complete cherry · share mustard | **event** type (arrivals take muted ink, the one rung that isn't an event) |
| single-hue teal ramp | **rank** (country pie), pooled tail in grey |
| dashed ink | an **annotation** over data (the growth trend line), not a series |

No colour is ever assigned to a player. Following one device in the activity feed is an **action** (click a chip, the rest dim), not a hue. Menu-mix bars are one hue, because nominal categories already carry their value in bar length.

### Dashboard tabs

Six tabs, each holding one **question** rather than one data source. **Today** (what's live, what's booked, today's service) · **Menu** (what we serve and how it lands) · **Players** (who's playing) · **Trends** (time only) · **Experiments** (did anything we did cause any of it) · **Activity** (the raw feed). The URL mirrors the tab in `?tab=`; Today's key is `today`. Every tab is surface-aware; **Menu is the mixed case**, where the toggle governs the dish report and not the catalogue mix, which the panel says out loud.

The engagement panel's day slice defaults to today, and a 📅 `DayPicker` can swap in any earlier ET day. Only days in `activeDates` are clickable. All-time charts are unaffected by the picked day; the Activity tab has its own day scope over its own `activeDays`, which **include arrival-only days** — a day where everybody bounced recorded no rounds and is exactly the day worth opening.

### Dish list filters (admin Dishes page)

`shared/dishfilter.ts`. Search plus eight facets as **chips**, a rested-days preset and five sorts.

- **"Never scheduled" means never, past *or* future** — the same rule as the shuffle. `GET /api/admin/dishes` returns `nextBooked` and `timesServed` alongside `lastServed` for this. Status is the one facet where a row holds a *set*.
- **Within a facet, picks are OR; across facets, AND.**
- **Every chip carries the count it would yield, computed with its own facet's selection dropped.** Empty chips are dimmed, never disabled — a zero is a fact about the catalogue.
- **Country is the one exception** and takes a type-ahead rather than a chip wall.
- **Never-served sorts as infinitely rested, not as zero.**
- **The filter parks in sessionStorage** (`lunch-special:admin-dish-filter`), coerced by `normalizeFilter()` so a stale blob can't poison the list. Session, not local: a filter is a train of thought, not a setting.
- **Every table cell is one line**, which is why the clue/ingredient shortfall lives inside the "incomplete" badge (`3/5 clues`) rather than as two columns.
- **The Menu tab links straight in** — every mix bar, the never-served sentence and each country row calls `onOpenDishes(filter)`.

### The specials board (admin Schedule page)

`shared/schedule.ts` folds the schedule window against the catalogue; `ScheduleView` draws it. One row per day, past days locked.

- **The dish picker draws its own listbox. Never a `<select>` per row, and never a `<datalist>`.** A select per row put tens of thousands of `<option>` nodes in the DOM (several hundred dishes × forty-odd unlocked days) and offered no search. A `<datalist>` searches *every* scrap of text in an option, so showing the country beside a dish meant typing a few letters matched a country and the list filled with names that had nothing to do with the query. **Don't reintroduce either.**
- **`matchDishes` searches names only**, prefix matches ahead of substring, capped at `DISH_MATCH_LIMIT` (8). The country and rest ride on each suggestion as *shown* text, never as searched text — that distinction is the whole reason the list is hand-drawn.
- **A typed name is resolved, not trusted.** `resolveDishName` matches trimmed and case-insensitively, and **a name two dishes share resolves to neither** — booking the wrong one silently is worse than asking for a rename. Leaving the field books a name that resolves outright and **puts anything else back in silence**: the suggestion list was open under the cursor, so a half-typed name needs no error.
- **A close repeat is stated, never blocked.** Autofill skips a dish used within `REPEAT_WINDOW_DAYS` (60) and the shuffle only rolls dishes never scheduled at all; hand-booking is the path where you might *want* the repeat, so the row prints the gap and books it anyway.
- **A serving is a serving wherever it was measured.** The nearest one to a day can sit inside the visible window or outside it in the catalogue's `lastServed` / `nextBooked`. The fold takes the minimum over all three, which is what stops a dish served the week before the window opens reading as never served. **The row's own date is excluded** — `lastServed` is computed against today, so counting it would flag every current Special as a zero-day repeat.
- **A write patches the one entry it changed; it never refetches the window.** Rewriting `entries` from the server re-rendered fifty rows to change one and the row visibly restacked. `buildBoard` still folds the whole window, so a booking that collides with another day updates both rest notes with no round trip. A booking and a clear paint before the request goes out and roll back if it fails; the shuffle can't, since the server picks.
- **Nothing in a row may change size, colour or weight while a write is in flight.** No `disabled` on the buttons — `.btn:disabled` paints `--miss`, which on a ghost button is a full colour swap for the length of one request. `aria-busy` plus opacity instead, and the busy guard lives in the handler. Every row renders **all four buttons** and hides the inapplicable ones with `visibility`, so the group holds its width instead of the picker and tags sliding sideways on every click.
- **Only errors get a line, and it sits on the row that raised one.** A success message restated what the row already shows and grew the row on every click. Panel-level messages are for panel-level actions (autofill).
- **`GET /schedule` has always taken `from`/`to`.** The window nav shifts relative to the rows that came back, so the **route keeps owning the default** (today-7 → today+45) and the client only ever moves away from it.
- **Edit and Test stay on past rows.** Only the *booking* is locked once a day is served; the dish is still a dish.

### Menu mix (admin Menu tab)

`GET /api/admin/menu-mix` → `assembleMenuMix()` in worker/menu.ts. Catalogue data only, so it takes **no `surface` or `date` filter** and touches no analytics table. Three slices: served (EPOCH→today) / booked (future) / pool (active dishes).

- **Every bar is one hue.** Nine region colours would re-encode what bar length already says.
- **The grey tick on a bar is the pool's share of that category**, which makes over- and under-serving visible without a second series.
- Days from EPOCH with no schedule row ran on the fallback pick and can't be reconstructed (the pool moves), so they're reported as `unscheduledDays` rather than folded into `served`.

### Announcements

Notices written in the admin, shown as a modal on **Today's Special only** — never on a Leftover, Chef's Choice, preview or playtest, which are side doors. Ordering: a first-timer gets the how-to first, then eligible notices; the auto-opened check for an already-finished round also goes first. Multiple live notices queue, oldest `start_date` first, one card at a time.

- **Window** is `start_date`/`end_date` as **ET days, both ends inclusive**. `is_active` is a manual kill switch that **outranks the dates** (status `retired`). All status/eligibility/validation logic is pure in worker/announcements.ts; the routes never re-derive it.
- **Audience** is `all` or `returning`. "Returning" = this device has finished ≥1 game (`loadStats().played > 0`), sent as `?returning=1`. Unverifiable by design; the worst a lying client buys is seeing a notice early. **A notice you aren't eligible for never leaves the Worker.**
- **Two ledgers**: localStorage (`lunch-special:announcements`) decides what to *show*, so the modal opens the frame the how-to closes with no round-trip; `announcement_views` counts who was *reached*, recorded **on display, not dismissal**, with PK `(announcement_id, player_id)` making the insert idempotent.
- **Body is limited markdown** — `**bold**`, `*italic*`/`_italic_`, `[label](url)`, nothing else. `shared/markdown.ts` emits **tokens** and `src/game/Markdown.tsx` renders React nodes. **There is no `innerHTML` in the path, so there's nothing to sanitize. Don't "improve" this into an HTML renderer.** `safeHref` allows only absolute http(s) or a same-site path; anything else (`javascript:`, `data:`, protocol-relative) degrades to plain text.
- **The `notice` Modal variant drops in from above and bounces**, where every other modal slides up from the bottom. That opposition is how a player tells it from the check at a glance. Two constraints if you retune it: the exit must stay within `MODAL_EXIT_MS` or the fallback unmount timer cuts it, and the footer's stagger is **transform-only** because it holds the card's only button.

### Dish requests and fan credit

After any finished round the check shows "Suggest a dish for the menu", POSTing `{ name, country?, note?, surface, playerId? }` to the **public** `POST /api/requests`. Anonymous, same trust model as analytics; an exact same-device name is silently ignored. Rows land in `dish_requests`, an inbox separate from the `dishes` catalogue. Field caps in `DISH_REQUEST_LIMITS`.

Admin **Requests** tab (nav badge = pending count): review, Remove, Clear all, **Add as dish** (opens a New Dish editor prefilled with name+country; on first save the source request is auto-removed via `requestId`), and **Copy all for Claude** → an `add dishes: Name (Country), …` line.

`dishes.is_fan_submission` is a **credit only** — nothing about scheduling, the fallback pick, feedback or analytics reads it. It rides on `RevealInfo`, so the stamp can only appear after game over. **"Add as dish" pre-ticks it.** The check's stamp sits at the very bottom directly on top of the suggest button and **carries the section break itself** (`--promoted` drops the dashed rule the collapsed form normally draws), because the check is the tallest card in the game at 375px. Mustard, not cherry, so it can't outrank the verdict. The dish list shows a `★ fan` badge beside the name (not in the Status column — origin isn't a state a dish can fail).

### Sound

Two buses, one mute button, and **not one audio file in the repo yet**. Dropping files into `src/assets/sfx/` is the whole installation step. No library: the two-bus graph is the half that matters and Howler doesn't model it.

- **A missing file is a supported state, not an error.** The engine resolves assets with `import.meta.glob`, never static imports — a static import of a missing file is a build error, and a glob of an absent directory is `{}`. **There is no `ENABLED` flag; the presence of a file is the switch. Don't reintroduce one.**
- **With no files the whole system stands down** (`audioAvailable()`): no graph, no context resume on first tap, and `SoundToggle` renders nothing. A mute button for silence is a control that visibly does nothing.
- **SFX are scheduled on the audio clock, never with `setTimeout`.** `guessArc` returns the whole sound of one guess (up to seven sounds over 1.14s) as *data*, and the engine schedules it in one burst against `AudioContext.currentTime`. The main thread is busy with React for most of that window.
- **The timing table mirrors the CSS dial, and it's a two-way contract.** `TILE_FLIP_START_MS`, `TILE_FLIP_STEP_MS`, `CHIP_LAND_MS` and `TICKET_MS` are the same numbers as `--tile-flip-start`, `--tile-flip-step`, `--chip-pop-start` and `--ticket-start` at the top of game.css. Re-time the animation and you must re-time this.
- **`AUDIO_DEFAULTS` is the only place a default lives**, keyed by `Surface` (Discord starts the bed, the web doesn't; effects on in both). Nothing else may assume a value for either bus.
- **Stored prefs are *optional* fields.** An absent field means "this device has never said", so a player who never touched the toggle picks up a policy change and one who did keeps their answer. Never write a resolved snapshot at first run.
- **The context is created at mount and left suspended**, effects decode during idle time, and the first gesture resumes it. Creating it lazily inside the gesture would miss the first sound of the session. The **bed is the exception** and isn't fetched until after that gesture.
- **Identical sounds on the same instant are refused** (`isDuplicateSchedule`, 40ms, safely under the 90ms flip stagger). Two identical buffers starting together sum to one sound 6dB louder with a click on the front. The concrete case is React StrictMode double-invoking mount effects in dev.
- **`prefers-reduced-motion` does not gate audio.** Motion preference governs motion; the mute button governs sound.
- **Mute is a ramp on the master gain and the bed keeps running under it.** A gain step to zero mid-waveform clicks, and `setMusicEnabled(false)` restarts the loop at the top.
- **`option-tick` is keyboard-only** — arrow keys, never `onMouseEnter`, which fires on every mouse move. It's computed *outside* the state updater, since an updater must stay pure and StrictMode runs it twice.
- **vite.config.ts carries two audio-specific lines**: `assetsInclude` for `.m4a`/`.opus`, and `build.assetsInlineLimit` refusing to inline audio (the default base64s anything under 4KB into the JS bundle every visitor parses).
- **`devBlip` is a dev-only oscillator** standing in for missing files, dropped from production builds. Delete it once real assets land, or keep it as a canary for a filename that stopped matching the registry.
- **The mute button is one control, not a mixing desk.** Splitting it later is a change to `SoundToggle.tsx` and nothing else. `.menu-card__toolbar` is `flex-wrap: wrap` with `white-space: nowrap` on the pills, so the row breaks between buttons rather than through a label.

### My own test data (admin Activity tab)

`GET /api/admin/device-data?player=<id>` reviews this browser's rows, `DELETE` on the same path wipes them.

- **"Me" is the Activity feed's `mine` filter, unchanged** (`peekPlayerId()`), so review and wipe can't describe different sets. Per-browser, not per-person: your phone and the Discord Activity are somebody else.
- **The review is a step, not a suggestion.** The delete button doesn't exist until the summary has loaded. Prod D1 has no automatic backup.
- **Three tables:** `analytics_rounds`, `analytics_visits` (arrivals), `announcement_views` (reach). `dish_requests` is deliberately excluded — a suggestion isn't analytics.
- **The delete reports what each table actually lost**, not what was asked for: a wipe that matched nothing is a wrong id.
- **The device id survives the wipe.** Nothing touches localStorage, so the next round records under the same id.

### Filing issues to GitHub (the nav's File an issue button)

`File an issue` sits in the admin nav on every panel and opens one modal: the compose form, with the repo's open issues listed under it. `worker/github.ts` holds every fold, `src/admin/IssueComposer.tsx` draws it, `GET`/`POST /api/admin/issues` do the talking.

- **GitHub is the record. There is no D1 table**, no migration and nothing to back up — unlike `dish_requests`, which is an inbox with no other home.
- **`GITHUB_TOKEN` never reaches the browser.** Same rule as `DISCORD_CLIENT_SECRET`: it can write to the repository. A fine-grained PAT, Issues: Read and write, that one repo, nothing else.
- **The read answers 200 with `configured: false`; the write answers 503.** That asymmetry is deliberate and is the one place this deviates from the Discord routes' 503-when-unconfigured convention: the composer's job with no token is to name the missing secret, and a 503 would put that sentence behind an error banner. The write genuinely cannot proceed, so it keeps the 503.
- **`GET /issues` returns pull requests too**, and they are dropped in `toIssue` by their `pull_request` key. Nothing else distinguishes a PR row.
- **A 404 from GitHub almost always means the token, not the name.** GitHub answers 404, not 403, when a token can see the account but not the repo, which is why `githubError` says so out loud.
- **One surface, not two.** The open-issue list exists to stop you filing a duplicate, and the moment that matters is while you are typing. A separate nav tab would put the check one click away from what it prevents.
- **The context block is why this isn't a link to `issues/new`.** The view, the URL (which carries the dashboard's `?tab=`), the dish under edit, the build and the viewport ride along, captured when the button is pressed rather than as the modal renders. The checkbox drops them when the issue isn't about a screen.
- **A failed label fetch costs the chips, not the composer.** Labels are a convenience; being unable to file because one of two parallel calls missed would not be.

## Adding dishes (when asked)

The user says **"add dishes: Pho (Vietnam), Bibimbap (South Korea)"**. Minimum is the **name**; country helps. Infer the rest, but **ask, don't guess, when a field is genuinely ambiguous** (regional protein variants, mostly).

**The `create-dishes` skill is the workflow, and its section 3 is the beat sheet** — the voice, the five beats, the character budgets, the fourteen hard rules and the two tests. Read it before writing a clue. `worker/data-integrity.test.ts` enforces the mechanizable half for every dish in the catalogue and fails in CI.

**Asking for one clue is a different job.** `suggest-clue` reads the dish's five clues and hands back options to paste into `/admin`, writing nothing. An admin edit lives in prod D1 only, so the linter never sees it — that skill does the mechanizable checks by hand instead.

Four things that hold regardless:

- **One dish = one `dishes` row + exactly 5 `clues` rows.** A dish is only schedulable with **≥3 ingredients AND exactly 5 clues**.
- **Renaming a dish in /admin regenerates its slug, and every backfill migration is keyed by slug.** A rename after a migration is written means that migration's `UPDATE`s match nothing and fail silently: seven US regional dishes were renamed in Aug 2026 and sat on pre-beat-sheet clue text in prod for a week while the repo and CI showed the rewrite. Re-aim the text at the new slug (migration 0034) rather than renaming prod back. `RETIRED_SLUGS` / `RENAMED_SLUGS` in `worker/data-integrity.test.ts` are how a slug leaves the catalogue without anyone editing a migration prod has already applied.
- **Rows go in two places:** appended to `seed/seed.sql` (canonical) *and* an additive `migrations/000N_add_<batch>.sql` — INSERTs only, no `DELETE`s, dish **keyed by slug** not a hardcoded id. CI applies it on the next `v*` release. Never re-run the seed against prod.
- **Pool only. Never `INSERT INTO schedule`.** New dishes land in the active pool; `/admin` autofill assigns dates.
- **Fan submissions** get `UPDATE dishes SET is_fan_submission = 1 WHERE slug IN (…)` in both files, keyed by slug. Leave the `INSERT INTO dishes` column lists alone — the column defaults to 0.

**Adding drinks is the same job against the other catalogue**: one `drinks` row plus exactly 3 `drink_clues` rows, ≥3 ingredients, written against the coaster sheet above. Rows go in `seed/seed.sql` *and* an additive migration keyed by slug, INSERTs only, and **never a `drink_schedule` row**. Keep the pool inside the 55–75% alcoholic band the linter enforces — if a batch is all cocktails, it will fail CI, and correctly.

Finish with `npm test && npm run check`.

## Conventions / gotchas

- Ingredients: JSON TEXT column, canonical lowercase singular ("tomato" not "tomatoes"). The admin tag input autocompletes from existing vocabulary — reuse names, don't fork spellings
- Dish is "schedulable" only with ≥3 ingredients AND exactly 5 clues (enforced in PUT /schedule + shown in UI)
- Schedule: past dates locked; DELETE dish blocked while scheduled today/future; autofill = least-recently-served, skips dishes used in last 60 days
- **The shuffle** (`POST /api/admin/schedule/shuffle`, the 🎲 on the Today tab's Tomorrow's Special card and on every unlocked row of the Schedule tab): rolls a dish that has **never held a schedule row, past or future**, onto one day, so you can click until something appealing turns up and then edit it. Three things are load-bearing: (1) **it writes on every click** — no accept step, since a roll that only proposed would need a commit button and a discard button; the displaced dish goes back in the pool; (2) **"never scheduled" is what stops consecutive clicks landing on the dish already showing**, since that dish has a row by the time the next roll is made; (3) only **schedulable** dishes are candidates, since `PUT /schedule` would refuse the others and the button would fail on press. A shuffled day is an ordinary booking afterwards
- **Clearing a day** (the Schedule tab's per-row Clear, `PUT /schedule` with a null `dishId`) deletes the schedule row, which is a booking decision and not a hole: an unbooked day runs on the deterministic fallback pick and never 404s
- Regions enum (near-match buckets): north-america, latin-america, europe, middle-east, africa, south-asia, east-asia, southeast-asia, oceania. Courses: breakfast, appetizer, entree, dessert, drink. Proteins: beef, pork, poultry, seafood, lamb, vegetarian
- SQL in seed files: escape apostrophes as `''`
- **The build marker.** Every page of the game carries the commit it was built from, bottom-right (`v1.7.0 · c61d712`, a trailing `*` for a dirty tree), so a screenshot or a screen recording says for itself which build it happened on. **Always on, everywhere, including production** — a marker you have to remember to switch on is one that isn't in the shot you needed it in. Four things hold: (1) it is **fixed at `z-index: 200`, above the modals**, because a shot of the check is the one most worth labelling; (2) `pointer-events: none` and `aria-hidden` — permanently on top of everything, it must never swallow a tap, and to a player it isn't content; (3) it is **not a round mode and not a setting** — nothing about it reaches the server, the beacons or localStorage, and there is no toggle to plumb; (4) the admin nav carries the same label, with the full sha and build time on its `title`
- **`__BUILD__` is injected by `define` in vite.config.ts**, read from `GITHUB_SHA`/`GITHUB_REF_NAME` first and git second. CI's ordering is load-bearing: `actions/checkout` is shallow and carries no tags, so `git describe` there would fail or name the wrong thing. **No git at all is a supported state** and reads as `dev`. `define` does not run under vitest, which is why every fold in `shared/build.ts` takes a `BuildInfo` argument — **don't let one reach for the global**, and don't reference `__BUILD__` from `worker/` (it's declared for the app project only, in src/vite-env.d.ts). Under `npm run dev` the value is fixed at server start
- vitest.config.ts exists SEPARATELY from vite.config.ts on purpose (tests must not load the cloudflare plugin). Its `include` covers `worker/` **and** `shared/` — the pure folds all live in one of those two
- `tsc -b` is incremental and will happily report success on a stale build graph — use `npx tsc -b --force` when you've changed a type in `shared/` and want to trust the answer
- tsconfig is 3 composite projects; worker code must not use DOM libs; app code gets DOM. Shared/ is included by both, and the node project lists `shared/build.ts` on its own so vite.config.ts can import the `BuildInfo` type
- `worker-configuration.d.ts` is generated (gitignored) — run cf-typegen, never hand-edit; Env type comes from it
- Cookies: HttpOnly+Secure+SameSite=Strict, 7-day HMAC token ("session" payload). Password check is digest-compared (timing-safe-ish)
- Don't add npm deps casually — the only runtime deps are hono, react, react-dom
- Windows repo (CRLF warnings from git are noise; ignore)
- Changing art: swap ai-*.svg in place (same viewBox ratio), update ASSETS.md; the neon logo is CSS text, not an image

## Accessibility (player-facing UI)

Target is WCAG 2.1 AA, scoped to the game. `/admin` is a password-gated single-user back office and is not held to this. The full record — the semantics inventory, the measured contrast table, the manual test passes — lives in the wiki. **These six rules are the ones a change has to satisfy, so they live here:**

- **Never encode meaning in colour alone.** A hue can be the fast channel, but a glyph, a border style, or a hidden text node has to carry the same fact. `title` doesn't count: invisible on touch, unreliable in screen readers. The attribute tiles are the worked example — colour, an `aria-hidden` glyph, and an `.sr-only` verdict, all off one table in `shared/announce.ts` so they can't drift
- **Anything that changes after a user action needs an announcement.** `role="status"` + `aria-live="polite"`, already used in four places. Reuse it rather than inventing one. Two regions rather than one on the guess flow, because the clue ticket lands ~1.14s behind the row and a single region written twice in quick succession drops the first message
- **Don't remove a focus indicator without replacing it.** `:focus-visible` is declared once near the bottom of `game.css` over every keyboard stop (3px mustard, offset 2px). `.dish-request__input:focus` sets `outline: none` and swaps the border to `--ink`, which is a visible replacement and fine. Bare `outline: none` is not
- **Every animation goes in the reduced-motion block** at the bottom of `game.css`, in the same commit as the keyframe. `admin.css` declares no animations and needs no block; keep it that way. `Modal.requestClose()` is the one JS check — a disabled animation never fires `animationend`. `playSfx()` deliberately does **not** check it
- **Check contrast before picking a colour**, not after. The `base.css` tokens are the safe set (`--hit-ink` 5.56, `--on-cherry` 4.85); both past failures came from a one-off hex in a component
- **Touch and hover are different.** `:hover` never fires on touch, so a control whose only feedback is a hover state has no feedback on a phone, which is the game's main surface. The `:active` press rules exist for this

`npm run a11y` runs axe over the running game (needs `npm run dev` alongside) and CI fails on `serious`/`critical`. It plays a round first and asks for reduced motion; `scripts/a11y-scan.mjs` says why for both. Automated checks cover about a third of WCAG, so treat a green run as a floor.

## Documentation

**The wiki is the only source of truth for documentation.** The repo carries agent instructions (this file), the beat sheet the clue linter enforces (`.claude/skills/create-dishes/SKILL.md`), the asset licence log (`ASSETS.md`), the landing page (`README.md`), and directory READMEs next to what they describe. Everything else — architecture, game design, interface, data, features, Discord, operations — is a wiki note.

- **Don't create a new top-level `.md` in the repo.** If a change wants one, it wants a wiki note. `ACCESSIBILITY.md` and `CLUES.md` were both folded into the wiki in Aug 2026 for exactly this reason
- **Never write the wiki's file path into the repo.** Not in a comment, not in a doc, not in a commit message. Say "the wiki". The location is held in agent memory and in `.claude/wiki-path.local`, which `.gitignore` already covers via `*.local`
- **Every wiki note is written under the `/stop-slop` skill.** Invoke it before writing or editing one. House style: non-verbose, wiki-linked (`[[Note Name]]`), tables and mermaid over paragraphs, no em dashes, active voice
- **`docs/lessons/` is the one documentation surface in the repo that isn't a wiki note**, and it stays that way because it isn't notes: each page is a self-contained HTML walkthrough of one subsystem, published with the rest of `docs/` on GitHub Pages and written for someone who has never seen the code. The wiki still owns what is *currently true*; a lesson explains *why the thing is shaped that way*. `docs/lessons/README.md` carries the house rules. This is not licence for a new `.md` anywhere else
- **Check `docs/index.html` before coining a term.** It's the case-study page and it holds the project's vocabulary — the beat sheet and its five *beats*, the Special, a clue ticket, the check, Leftovers, Chef's Choice, a note from the kitchen. Don't run a second name alongside an existing one

### Before opening a PR

Three passes, every time, before `gh pr create`:

1. **CLAUDE.md.** Does the change make anything here stale or wrong? Add, edit or delete in the same PR. A rule this file states and the code no longer follows is worse than no rule
2. **The wiki.** Which note covers what changed? Update it in the same sitting, under `/stop-slop`. Wiki edits are not part of the PR (different repo, no repo at all), so they have to happen before the PR is opened or they don't happen
3. **`git grep` the diff for the wiki path**, and confirm the PR carries labels (`gh label list` → `gh pr create --label`)

## Verify a change

`npm test && npm run check`, then dev server (`npm run a11y` in a second terminal while it's up), then by hand: play a full round (guess wrong twice → clue tickets appear → guess right → receipt modal), **then `npm run lastcall` and walk the hand-off into a Nightcap**, check /admin dashboard/editor/schedule and the Bar section, and mobile at 375px (no horizontal scroll). For UI changes also run the keyboard-only and reduced-motion passes (unplug the mouse and play a full round opening every modal; then DevTools → Rendering → emulate `prefers-reduced-motion: reduce` and confirm nothing moves and nothing sticks), plus 320px and 200% zoom. Seeded local answer for 2026-07-17 is Hamburger (id 51); schedule table maps the rest.
