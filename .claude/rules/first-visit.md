---
paths:
  - "shared/coach.ts"
  - "src/game/Coach.tsx"
  - "worker/announcements.ts"
  - "worker/routes/admin/announcements.ts"
  - "src/game/AnnouncementModal.tsx"
  - "src/admin/AnnouncementsPanel.tsx"
  - "shared/types/announcements.ts"
  - "worker/requests.ts"
  - "worker/routes/admin/requests.ts"
  - "src/admin/RequestsView.tsx"
  - "src/game/RequestForm.tsx"
  - "shared/audio.ts"
  - "src/audio/**"
  - "src/game/SoundToggle.tsx"
  - "src/assets/sfx/**"
  - "src/admin/ActivityPanel.tsx"
  - "worker/routes/admin/activity.ts"
  - "src/admin/IssueComposer.tsx"
  - "worker/routes/admin/issues.ts"
  - "shared/types/issues.ts"
---

# First visit, notices, requests, sound

- **No auto-opened how-to.** Three coach marks (`order`, `pick`, `read`) are derived from the round (`shared/coach.ts`), never stepped or timed; `coachingDone` writes `lunch-special:howto-seen`. The spotlight is one fixed dim at `z-index: 35` with no cut-out (`.guess-input` sits at 40). Every callout has a ×. Showcase visitors are never coached; notices wait until the walkthrough ends. After Dark has a one-beat intro (`nightIntroDue`, `lunch-special:afterdark-seen`).
- **Announcements:** Today's Special only. Window is ET days, both ends inclusive; `is_active` outranks the dates. Logic in `worker/announcements.ts`. A notice you aren't eligible for never leaves the Worker. Body is limited markdown rendered as tokens; **no `innerHTML`, don't build an HTML renderer**; same-site links go through `surfaceUrl()`. A **note to one player** sets `announcements.player_id`: only that device is served it (`isEligible`, `?player=`), audience is ignored, and it is received when `announcement_views` has a row for that same id. Opened from a request's "Note to this player"; Overview's "On the board" leaves notes out. A device id is not a person (Discord ids churn). The `notice` modal drops from above so it differs from the check; its exit must stay within `MODAL_EXIT_MS`.
- **Requests:** `POST /api/requests` is public and anonymous. A name matching a **booked day before ET today** answers `served: { name, date }` (`worker/requests.ts`, whole-name fold) and still lands in the inbox; today and later bookings never leak. Inbox is `dish_requests` with `kind` (`REQUEST_KINDS`); the admin renders one section per kind off that enum. `from_country` is the requester's, stamped from the edge like a round's `country` (never the body, never the dish's `country`); NULL before 0061 is unmeasured. `is_fan_submission` is a credit only; nothing reads it for scheduling or feedback. "Add as dish/drink" pre-ticks it.
- **Sound:** two buses, one mute button, no audio files in the repo yet. A missing file is a supported state; the engine uses `import.meta.glob` and there is **no ENABLED flag**. Without files the whole system stands down. SFX are scheduled on the audio clock via `guessArc`, never `setTimeout`. `shared/audio.ts` timing constants mirror the CSS dial in game.css; re-time one and you re-time both. `AUDIO_DEFAULTS` is the only home of a default; stored prefs are optional fields. Reduced motion does not gate audio. `option-tick` is keyboard-only and computed outside the state updater.
- **My own test data** (Activity tab): "me" is the feed's `mine` filter (`peekPlayerId()`); review precedes wipe; tables are `analytics_guesses` (first, by `player_id` or round), `kids_menu_opens` (by round, before the rounds), `analytics_rounds`, `analytics_visits`, `announcement_views`, `occasion_views` (not `dish_requests`); the device id survives.
- **Issue composer:** GitHub is the record (no D1 table). `GITHUB_TOKEN` never reaches the browser. The read answers 200 with `configured: false`, the write 503. `GET /issues` drops PRs in `toIssue`.
