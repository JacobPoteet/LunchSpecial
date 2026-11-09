---
paths:
  - "worker/routes/analytics.ts"
  - "worker/routes/public.ts"
  - "worker/routes/kidsmenu.ts"
  - "worker/routes/nightcap.ts"
  - "worker/guesslog.ts"
  - "worker/pastrounds.ts"
  - "src/game/roundLifecycle.ts"
  - "src/game/useRoundTelemetry.ts"
  - "shared/types/analytics.ts"
  - "src/admin/ActivityPanel.tsx"
  - "worker/routes/admin/activity.ts"
---

# Beacons and guess logging

- `player_id` is an anonymous per-device UUID, bound only by `/start`. `kind` and `surface` are set on insert only; Discord iframe params are captured into sessionStorage and re-attached by `surfaceUrl()`. `country` is stamped server-side. `dish_id` is resolved by `resolveDishId` (random dishes send `seed`). `source` is re-normalised by the Worker always, captured into sessionStorage, never localStorage. Visits: `markSeated()` decides to send, `PRIMARY KEY (visit_day, player_id)` decides to count; first touch wins.
- **Guesses are written by the guess routes, not a beacon** (`analytics_guesses`, `worker/guesslog.ts`). The client sends `roundId` on `/guess` and `/night/guess` for tracked rounds only (plus `fromKidsMenu` on an order off the card, believed only past `MENU_AFTER`); previews, playtests and pins record nothing, and the Worker re-checks. No FK to `analytics_rounds` (a blocked `/start` must not drop a guess); the target is stored on the row, never joined from `schedule`. Dish and drink ids sit in separate column pairs. Rows older than 0053 are unmeasured. Each row carries the client's `player_id` too, so a wipe reaches guesses with no round row; wiping deletes them first. Last write per guess number wins (a retry after a lost response sends the board's dish). `correct` is not stored: it is guessed = target. Aggregate only on any public route; no per-device guess trail. The one per-round read is admin-only: the Activity feed's expanded row calls `GET /api/admin/round-guesses?round=<id>` (`foldRoundGuesses`), keyed by round id alone, and draws the round as one timeline (start, each guess with its wait, finish, share). An empty answer is unmeasured, never "no guesses".
