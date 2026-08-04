<!-- Closes #N -->

<!-- Keep it short — a reviewer should get the picture in under a minute.
     Budget: ~200 words for a normal PR, three lines for a one-file fix.
     Scale down, never up. The diff shows the code; don't narrate it. -->

## Why

<!-- One or two sentences. For a bug, the root cause. -->

## What changed

<!-- Bullets, one per file or area, one line each. What's different for a
     player or an admin. -->

## Reviewer notes

<!-- Optional. Only decisions the diff can't explain, as bullets. If it's
     visible in the diff it doesn't go here. Delete the section if empty. -->

## Verification

<!-- `npm test` / `npm run check`, the screen or round you exercised, and
     anything you did NOT verify. Two or three lines. -->

<!-- If this PR touches any of these, move that line out of this comment and tick
     it. Otherwise leave the whole block commented — none of them fail loudly:
- [ ] spoilers — target dish reaching the client outside `/reveal`, or a free-play path reading `schedule`
- [ ] D1 migration — additive only, dish keyed by slug, no `DELETE`, no `INSERT INTO schedule`
- [ ] new dishes — exactly 5 clues and >=3 ingredients, in both `seed/seed.sql` and a migration
- [ ] client-called URL — nothing matching analytics/event/track/collect/beacon/telemetry/pixel
- [ ] Discord surface, or a new animation needing `prefers-reduced-motion`
-->
