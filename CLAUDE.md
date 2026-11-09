# Lunch Special

Daily Wordle-style game: guess the diner's "Special" (a world dish). 1950s diner theme. One Cloudflare Worker serves everything: React SPA (Workers Static Assets) + Hono API + D1. No accounts; player state in localStorage.

**This file is rules, not documentation.** It carries what a change must not break and what the code can't tell you. How things work: read the code (pure folds in `shared/` and `worker/` each have a test beside them). Why they're shaped that way: the wiki (see "Documentation"). Area rules live in `.claude/rules/*.md` and load with the files they cover.

Follows the workflow standard in the user CLAUDE.md: squash merges, `/ship` to land a PR, `/release` to cut one, bugs fixed when found. Deviations are listed at the end.

## Commands

```bash
npm run dev          # vite dev (Worker in workerd via @cloudflare/vite-plugin), http://localhost:5173
npm run play         # opens /play: a fresh round on a random dish, nothing saved (dev only)
npm run ramen        # same, pinned to one dish (/play?special=ramen)
npm run lastcall     # hand-off harness: seeds a finished, won Special so the After Dark band is live
npm run negroni      # a Nightcap on one named pour, opening hours ignored (?bar=1&nightcap=negroni)
npm run halloween    # the diner in its Halloween costume (?occasion=halloween; works on any URL, any build)
npm run admin        # opens /admin at the login
npm test             # vitest: worker/**/*.test.ts + shared/**/*.test.ts
npm run check        # tsc -b (3 project refs: app / worker / node)
npm run lint         # oxlint. rules-of-hooks is an error, exhaustive-deps a warning
npm run a11y         # axe over the RUNNING game (needs `npm run dev` in another terminal)
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

**Live:** https://lunchspecial.app. Releases: `/release` (see "Cutting a release"); the tag push runs `deploy.yml` (test + check + remote migrate + deploy). `ci.yml` (test, check, lint, a11y) and `codeql.yml` run on push/PR to `main`.

- **Prod D1 is the only copy of half the data.** `seed.sql` + `migrations/` rebuild the dish/drink *pool* only. `schedule`, `drink_schedule`, admin edits, analytics, requests, announcements, experiments and `sound_prefs` exist only in prod. Dashboard-vs-seed divergence is expected.
- **`npm run db:seed:remote` is destructive** (replaces every booked Special). Never run it against prod. No automatic backup exists: export first.
- **CI runs migrations (additive, idempotent), never the seed.**
- **Never add `INSERT INTO schedule` or `INSERT INTO drink_schedule`.** Booking happens in /admin; unbooked days run on the deterministic fallback pick.
- **Secrets** (`ADMIN_PASSWORD`, `SESSION_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_PUBLIC_KEY`, `GITHUB_TOKEN`): `wrangler secret put`, persist across deploys. Discord and GitHub ones are optional; unconfigured, the feature degrades and nothing else breaks. **A new Worker secret must be added to `.dev.vars.example`**, or CI's placeholder `.dev.vars` lacks it and `tsc` fails. `GITHUB_REPO` and `VITE_DISCORD_CLIENT_ID` are public (the latter is a build-time Vite var, in `.env.local`, not `.dev.vars`). `DISCORD_BOT_TOKEN` is used only by `discord:register`.
- `ci.yml` runs on every PR. Its `changes` job skips `test` and `a11y` when a PR touches only `**.md`, `docs/**` or `discord-assets/**`, and the `CI gate` job reports for all of them; `CI gate` is the required check on `main`. `codeql.yml` keeps the same three paths as `paths-ignore` and is not required. Keep the two lists in sync.
- `deploy.yml` re-runs test + check on purpose and checks out with `fetch-depth: 0` (the build marker needs tags).

## Discord Activity

Runs as an embedded iframe with **no separate build**: Discord proxies `lunchspecial.app`. Client code is `src/discord/`, activated by the `frame_id` query param; off Discord the SDK is never downloaded. **Never name the dish** in presence copy or the score card; a test pins it. The rest: `.claude/rules/discord.md`.

## After Dark

A second daily puzzle: one **drink** a night, **4 guesses**, **3 coasters**, between 20:00 and 03:00 on the player's own clock. Vocabulary: *Nightcap* (Night #N), *coaster*, *tab* (the bar's check), *Libations* (card heading). "After Dark" names the marquee and nothing else.

`shared/night.ts` is the only place that decides when the bar is open or which night a round belongs to. **Never add `INSERT INTO drink_schedule`.** The rest: `.claude/rules/after-dark.md` (the Nightcap's dashboard rules are in `dashboard.md`).

## Occasions

A costume the game wears for a stretch of the calendar (Halloween first). **Handcrafted in code; /admin only decides when.** Never call it an "event" in a URL, path or table (ad blockers; `conventions.test.ts`).

`shared/occasions.ts` decides which occasion a day wears. **No booking, no costume.** Never `INSERT INTO occasion_bookings` from a migration or the seed. The rest: `.claude/rules/occasions.md`.

## Game rules

- **6 guesses.** `POST /guess` returns clue N after miss N from `clues.order_index`. Feedback: ingredient set intersection (exact, plus **close**) + 4 tiles. Country: hit = same country, near = same `region`, miss. Course/temperature/protein: hit|miss.
- A near country tile names its region (`attributes.country.region`) **in place of the tile's label**, never on its own line (tiles must stay one height). `region` is optional on the wire for old saved rounds.
- The order bar shows each dish's country but **searches names only** (`rankByName`, prefix before contains, accent-folded; never a `<datalist>`). Don't re-implement the search in a component.
- **Reveal is client-initiated after game over** (Wordle trust model; don't "fix" it).
- Unscheduled date → deterministic FNV-hash pick from active dishes; the game never 404s.
- The puzzle date rolls at **midnight ET for everyone** (`gameToday`, `msUntilGameMidnight` in `shared/time.ts`). Server accepts today ±2 days or any earlier puzzle back to `EPOCH_DATE` (`isPlayableDate`). Puzzle #1 = 2026-07-17.

### Kids' Menu

An opt-in short list of the dishes that still fit, from the fourth miss (`MENU_AFTER`). Rules in `shared/kidsmenu.ts`; Worker in `worker/kidsmenu.ts` + `routes/kidsmenu.ts`; card in `src/game/KidsMenu.tsx`. **Leave no trace**: share text, grid, check and stats never mention it. Never call it a cheat on screen. The rest: `.claude/rules/kids-menu.md`.

### Ingredient families (amber "close" chip)

A family is a **partition, never a graph**; all of it is `shared/families.ts`. Close is never colour alone. The rest: `.claude/rules/families.md`.

### Round modes

`resolveMode()` in `shared/mode.ts` is the table as code; GamePage reads its flags once. Don't re-derive a mode from `window.location`.

- Archive unlocks once today's Special is finished. A finished daily is also saved to `lunch-special:archive` (the daily slot is overwritten each day). Never archive an unfinished daily. Recovered days (`POST /api/rounds/past` → `lunch-special:recovered`) are outcomes, never boards; `RECOVER_THROUGH` must never sit earlier than the release carrying #215; that route is temporary.
- Preview (admin test play, 24h token) records nothing. Playtest's `?special=` is honoured by the client only under `import.meta.env.DEV`. Preview and playtest are dressed as the daily (`dressedAsDaily`); only the top banner marks them; the share button fires no beacon.
- Streak: every printed streak goes through `shared/streak.ts`; never print `currentStreak` raw.
- Daily tally (`shared/tally.ts`): real daily only (`isToday`, not `asDaily`); nothing under `SMALL_SAMPLE_MIN`; percentage of finished rounds; never in the share text.
- **Sharing a finished round:** the whole message travels in one field, never `text` + `url`; `buildShareText` stays url-free. The idle label is "Share" everywhere (`shareLabel()` in `useShare.ts`). Phone test is a coarse *primary* `pointer`, not `any-pointer`; `canShare()` absent is not a refusal. A dismissed sheet (`AbortError`) is silent. Every success confirms.

### Beacons and analytics

- `.claude/rules/telemetry.md` covers `player_id`, sources, visits and guess logging.
- **Keep client-called URLs boring** (ad blockers match `analytics`, `event`, `track`, `visit`, `view` and similar; `shared/conventions.test.ts` enforces it). Beacons are `/api/rounds/seated|start|complete|share`, plus `/api/announcements/seen` and `/api/occasions/seen`; the admin feed is `/api/admin/recent-rounds`. The Kids' Menu is `/api/kids-menu`.

### Rules the dashboard obeys

- **Never report "unmeasured" as zero.** NULL `visited`, `country`, `dish_id`, `source` mean pre-feature rows: `untracked`, never a slice or a dish.
- **On-screen copy is a fragment.** State the fact ("No guesses on file."), never the method or the reasoning; that lives in code comments and the wiki. No "What this counts" fold-outs. Unmeasured still never reads as zero, just in fewer words.
- The rest: `.claude/rules/dashboard.md`.

## First visit, notices, requests, sound

No auto-opened how-to, and no `innerHTML` in announcements. `.claude/rules/first-visit.md` covers coach marks, announcements and notes to one player, requests, sound, wiping your own test data, and the issue composer.

## Adding dishes and drinks

`/create-dishes` and `/create-drinks` are the workflows; each skill's section 3 is the beat sheet. Read it before writing a clue. `worker/data-integrity.test.ts` enforces the mechanizable half. **Source every historical or numerical claim before writing it.** One-clue requests go to `suggest-clue`, which writes nothing.

- **Dish** = one `dishes` row + exactly 5 `clues`; schedulable only with ≥3 ingredients AND exactly 5 clues. **Drink** = one `drinks` row + exactly 3 `drink_clues`, ≥3 ingredients, pool inside 55–80% alcoholic.
- Rows go in `seed/seed.sql` **and** an additive `migrations/000N_add_<batch>.sql` (INSERTs only, keyed by slug). Never re-run the seed on prod. **Pool only; never a schedule row.**
- **Renaming a dish in /admin regenerates its slug, and every backfill migration is keyed by slug**, so an earlier migration's `UPDATE`s silently match nothing. Re-aim with a new migration. `RETIRED_SLUGS` / `RENAMED_SLUGS` in the integrity test are how a slug leaves.
- Fan submissions: `UPDATE … SET is_fan_submission = 1 WHERE slug IN (…)` in both files; leave `INSERT` column lists alone. A suggested dish the catalogue already has still takes the credit (UPDATE only; say so in the migration comment).
- Finish with `npm test && npm run check && npm run lint`.

## Conventions / gotchas

- Ingredients: JSON TEXT, canonical lowercase singular. Reuse existing vocabulary.
- Schedule: past dates locked; deleting or deactivating a dish scheduled today/future is blocked; `PUT /schedule` and `PUT /nights` refuse inactive items. Autofill: rest tier → variety penalty → exact rest (`worker/variety.ts`), skipping the last 60 days. The shuffle (🎲) rolls a never-scheduled, schedulable dish and writes on every click. Clearing a day deletes its row; the fallback pick covers it.
- Courses: breakfast, appetizer, entree, dessert (`SERVABLE_COURSES`). `drink` is history only: the bar owns drinks, the kitchen's eight are inactive (0078), the save route 400s a new or active one and the integrity test fails on one. It stays in the `CHECK`, `Course`, `COURSES` and `t.courses.drink` for old rounds; the Kids' Menu keeps the full `COURSES`.
- Windows repo; CRLF warnings are noise.
- Styling (tokens, press areas, the three faces, no emoji in the chrome): `.claude/rules/styles.md`.
- **Build marker:** the footer's last line shows the version (`v1.7.0`, `*` if dirty; never sha or branch, which ride on `title` and the admin line). Always on, in page flow (never a fixed badge), not a setting, nothing reaches the server. `__BUILD__` is a vite `define`; folds take a `BuildInfo` and never read it (`shared/conventions.test.ts` enforces this for `worker/` and `shared/`). "No git" reads as `dev`.
- Deliberate holes in hook dependency lists carry `eslint-disable-next-line react-hooks/exhaustive-deps` on the line before the array, reason in the comment above. `react/set-state-in-effect` is off in `.oxlintrc.json` on purpose.
- `vitest.config.ts` is separate from `vite.config.ts` on purpose (tests must not load the cloudflare plugin); it covers `worker/` and `shared/`.
- `tsc -b` is incremental and can report success on a stale graph; use `npx tsc -b --force` after changing a `shared/` type. Three composite projects: worker code uses no DOM libs. `worker-configuration.d.ts` is generated, never hand-edited.
- Routes under `worker/routes/admin/` are mounted in a load-bearing order: `auth.ts` above the session guard, everything else below.
- Public GETs with a `Cache-Control` header: `/api/dishes` and `/api/night/drinks` only (5 min). Keep it off `/daily`, `/occasions` and the beacons.
- Don't add npm deps casually; the only runtime deps are hono, react, react-dom.
- Art: swap `ai-*.svg` in place (same viewBox ratio, keep the AI-GENERATED header) and update `ASSETS.md`. The neon logo is CSS text.

## Languages

In progress (#269), landing as a stack of PRs. The game's own words go through a typed catalog; content (dish and drink names, ingredients, clues, coasters, country names) stays English until phase 2. `/admin` stays English. Shipped languages: English, Spanish (`es`, a draft: `autoDetect: false` until a native speaker reads it). `/translate` drafts the next one.

- **No raw English in `src/game` or `src/occasions` JSX**: text and word-carrying props (`aria-label`, `title`, `placeholder`, `alt`, `label`, `text`) come from `t`; `conventions.test.ts` walks the TSX and allows only the brand ("Lunch Special", "After Dark"). Bold inside a sentence is `**word**` in one message, rendered by `InlineMarkdown`, never three fragments. Only catalog text goes through it; a dish, drink or player-typed name never does.
- The rest: `.claude/rules/i18n.md`.

## Accessibility (player-facing UI)

WCAG 2.1 AA for the game; `/admin` is exempt.

- **Never encode meaning in colour alone**: pair with a glyph/border and an `.sr-only` text: the glyph off `shared/announce.ts`, the words off the catalog (`t.announce.match`). `title` doesn't count.
- **Anything that changes after a user action is announced** (`role="status"` + `aria-live="polite"`); the guess flow uses two regions because the clue lands ~1.14s after the row.
- **Don't remove a focus indicator without replacing it.** `:focus-visible` is declared once at the bottom of `game.css`.
- **Every animation goes in the reduced-motion block** at the bottom of `game.css`, same commit as the keyframe. `playSfx()` deliberately does not check it.
- **Check contrast before picking a colour**; use `base.css` tokens (`--hit-ink` 5.56, `--on-cherry` 4.85).
- **`:hover` never fires on touch**; keep the `:active` press rules.

`npm run a11y` fails CI on serious/critical. A green run is a floor.

## Documentation

**The wiki is the only source of truth for documentation.** The repo carries this file, the two beat-sheet skills (`.claude/skills/create-dishes`, `create-drinks`), the `translate` skill, the area rules in `.claude/rules/`, `ASSETS.md`, `README.md`, and directory READMEs.

- **Don't create a new top-level `.md`**; a change that wants one wants a wiki note.
- `docs/lessons/` is the one non-wiki doc surface (self-contained HTML walkthroughs; see its README).
- **Check `docs/index.html` before coining a term.** It holds the vocabulary (beats, beat sheet, the Special, clue ticket, the check, Leftovers, Chef's Choice, note from the kitchen).

**Before opening a PR:** (1) does this file still tell the truth? Edit it in the same PR. (2) Name the wiki notes the change affects under `## Wiki notes` in the PR body; `/release` writes them. (3) confirm labels; the wiki-path leak is caught by `npm test` on your machine (`gh label list` → `gh pr create --label`).

## Verify a change

`npm test && npm run check && npm run lint`, then the dev server (`npm run a11y` in a second terminal), then by hand: play a full round (miss twice → clue tickets → win → receipt), **then `npm run lastcall` and walk the hand-off into a Nightcap**, check /admin (dashboard, editor, schedule, Bar) and 375px (no horizontal scroll). For UI changes also do the keyboard-only and reduced-motion passes, plus 320px and 200% zoom. Seeded local answer for 2026-07-17 is Hamburger (id 51).

## Cutting a release

Run `/release`. The version lives only in the tag: `vite.config.ts` reads it with `git describe`, and `package.json`'s `0.1.0` is unused, so there is no version file to bump and no release PR unless the notes go in a file. Release notes go on the GitHub release. The tag push runs `deploy.yml` (test, check, remote migrate, deploy); after it goes green, check the footer on https://lunchspecial.app shows the new version.

## Deviations from the standard

| Deviation | Why |
| --- | --- |
| `docs/` holds the GitHub Pages landing page (`docs/index.html`, the vocabulary) and `docs/lessons/` | They are published pages, not documentation the wiki could hold |
| `ASSETS.md` stays in the repo | It is the licence log for the art beside it |
