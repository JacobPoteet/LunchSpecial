# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: anonymous, no-account casual players who open the game for a couple of minutes once a day, either on the open web (lunchspecial.app) or inside a Discord server through the embedded Activity. They're the Wordle-style daily-puzzle audience — people who already have a rotation of one-a-day games and are looking for one more, plus people who show up because a friend shared a result grid in a Discord channel.

Secondary: the sole admin/maintainer, who uses the password-gated `/admin` panel to book the schedule, write clues, moderate player suggestions, post announcements, and read the analytics dashboard — the only person who ever sees a per-player number.

## Product Purpose

Daily dish-guessing game themed as a 1950s diner. Each day the diner serves one "Special," a world dish; players get 6 guesses, each revealing ingredient overlap and how four attributes (country/region, course, temperature, protein) compare, with a clue ticket handed over after every miss. Success for a round is solving it, or at least engaging with the clue ladder; success for the product is a habit — people returning day after day, and, for Discord servers, sharing results back into the channel. There's a second nightly puzzle for returning players (After Dark: one drink, 4 guesses, 3 coasters, 20:00–03:00 on the player's own clock) that exists purely as a bonus for people who already finished the day's Special, not a growth lever.

## Positioning

Distinguishes itself from generic Wordle clones by: (1) ingredient-set intersection as the core feedback mechanism rather than letter position — a guess teaches you about the dish's makeup, not just hit or miss; (2) a deliberately written five-beat clue ladder (vague to specific) held to a maintained style guide, rather than auto-generated hints; (3) running unmodified inside Discord as an embedded Activity with live per-round presence and a channel-postable result card, not just a linkable web page; (4) an admin analytics practice that refuses to report numbers it can't stand behind (Wilson intervals under small samples, censored retention denominators, "too early to tell" as a real verdict) — a level of statistical honesty a hobby project doesn't usually bother with.

## Operating Context

- Played in short (1–6 guess) sessions, once a day per mode, from a phone or desktop browser, or from inside a Discord server via the embedded Activity iframe.
- No login: identity is an anonymous per-device UUID in localStorage; a player who clears storage or switches devices starts over.
- The daily puzzle rolls over at midnight America/New_York for everyone regardless of the player's own timezone; After Dark is the one mode that runs on the player's own local clock instead (20:00–03:00, with a "night" defined as the local calendar day the evening began on).
- The maintainer runs the whole operation solo through `/admin`: writing dishes/drinks and their clues, booking the schedule weeks ahead, moderating player-submitted dish/drink requests, posting occasional announcements, and reading a seven-tab analytics dashboard, all against a single production Cloudflare D1 database with no automatic backup.
- Ships as one Cloudflare Worker (React SPA + Hono API + D1) with no separate Discord build; a version tag deploys both surfaces at once.

## Capabilities and Constraints

- 6 guesses on the daily Special, 4 on After Dark's Nightcap; feedback is ingredient-set intersection plus attribute tiles (country/region "near," course, temperature, protein by day; country, temperature, spirit, profile at night).
- A clue is revealed after each miss, one of five (day) or three (night) pre-written beats, vague to specific; dishes and drinks are only "schedulable" once they carry a complete clue set and at least 3 ingredients.
- No accounts, ever — player state and lifetime stats live entirely in localStorage; the admin dashboard reports on anonymous, aggregate device behavior only, never a per-player row.
- Modes beyond the daily: Leftovers (archive of past Specials, unlocked after finishing today's), Chef's Choice (no-stakes random dish, spoiler-free, nothing saved), and After Dark (the nightly drink puzzle, gated on finishing the day's Special).
- Runs identically on the open web and as a Discord Activity (same Worker, no separate deploy); inside Discord it adds Rich Presence, a channel-postable result card, and a live-updating progress message, all without ever naming the answer or reading the player's Discord identity beyond what the handshake requires.
- Public, aggregate-only stats are exposed via a JSON endpoint and shields.io-compatible badges; nothing about an individual player or round is ever queryable from outside `/admin`.
- Accessibility target is WCAG 2.1 AA on every player-facing surface (`/admin` is exempted as a password-gated single-user tool).
- Constraint: production D1 holds the only copy of the booked schedule, admin edits, analytics, and requests — the repo's seed and migrations only ever reconstruct the dish and drink pools, never that operational data, and there is no automatic backup.

## Brand Commitments

A 1950s American diner is the whole visual and verbal world: a "Special," a "check," a "clue ticket," "Leftovers," "Chef's Choice," a "note from the kitchen," extending after dark into a bar's vocabulary ("Nightcap," a "coaster," the "tab," "Libations"). Three typefaces carry the theme — a slab-serif "sign" face, a script for neon and flourishes, and a condensed "printer" face for small print — and no emoji ever appears in the game's chrome, only hand-drawn stroke icons. Copy voice throughout the clue and coaster beat sheets is plain, warm, and specific, against a maintained list of banned openers, praise, and hedges, with no em dashes. The build-version footer line is attributed to the maintainer alone.

## Evidence on Hand

- A live, populated catalogue: roughly 379 dishes at last count, each with 5 written clues and a canonical ingredient list, plus a smaller drinks catalogue for After Dark — both enforced against a data-integrity linter in CI.
- Real, continuously updating engagement numbers from production (rounds played, completion/solve rate, shares), exposed publicly at `/api/stats` and used as the README's own badges.
- No user research, personas, or usability testing beyond the maintainer's own play-testing and ad hoc player-submitted dish/drink requests; don't fabricate testimonials, survey results, or named-user quotes.

## Product Principles

1. Never report a number the data can't support — censor thin denominators, refuse to compare too-early experiments, and prefer "too early to tell" or "unmeasured" over a misleading zero or percentage.
2. The daily habit is the product — every mode and gate (the ET midnight rollover, After Dark's finish-lunch gate, the archive unlocking only after today) exists to protect one clean puzzle a day, not to maximize time on page.
3. Anonymous by construction — no accounts, no per-player rows leave the browser, and the admin's own analytics are aggregate-only; a feature that requires identifying a player is out of scope.
4. One world, one vocabulary — the diner and its after-hours bar are a fully committed theme, not a skin, so new copy and UI go through the same established terms rather than inventing parallel ones.
5. A single maintainer runs this at negligible cost — the whole game, API, and admin ship as one Cloudflare Worker with no server to manage, and design or ops choices should keep it that way.

## Accessibility & Inclusion

WCAG 2.1 AA on every player-facing surface (the game UI, both boards, the receipt/check, modals, After Dark). Color is never the only channel for game-state meaning — attribute tiles pair color with a glyph and screen-reader text; focus indicators, live-region announcements on state changes, and a reduced-motion pass are treated as required, not optional. `/admin` is a password-gated single-user back office and is explicitly not held to this bar.
