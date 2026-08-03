<!-- Closes #N -->

## Why

<!-- The problem being solved. For a bug, the root cause, not just the symptom. -->

## What changed

<!-- What's different for a player or an admin, and which layer it landed in. -->

## Reviewer notes

<!-- Only what the diff can't say for itself: decisions taken on purpose, seams
     left in, anything worth preserving if this gets revisited. Delete if none. -->

## Verification

<!-- What you ran and what it showed: `npm test`, `npm run check`, and the round
     or screen you actually exercised. Name anything you did NOT verify. -->

<!-- Then point the reviewer at what would convince them — the specific screen,
     route or state, and anything only reachable in a particular mode: a
     Leftovers replay, Chef's Choice, the Discord Activity, a fresh
     localStorage, the midnight-ET rollover, 375px. -->

<!-- Call it out here if this PR touches any of these, since none of them fail
     loudly:
     - spoilers — the target dish reaching the client anywhere but `/reveal`,
       or a free-play path reading the `schedule`
     - a D1 migration — additive only, dishes keyed by slug, no `DELETE` and no
       `INSERT INTO schedule`; prod holds the only copy of the schedule and of
       every admin edit
     - new dishes — exactly 5 clues and >=3 ingredients each, in both
       `seed/seed.sql` and a migration
     - a client-called URL — nothing matching analytics/event/track/collect/
       beacon/telemetry/pixel, or ad blockers silently drop it
     - the Discord surface, or a new animation needing `prefers-reduced-motion`
-->
