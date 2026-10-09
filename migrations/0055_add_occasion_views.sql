-- Who saw an occasion's costume, and who found its secret (shared/occasions.ts).
--
-- The occasion report could only say what a costumed stretch of days did to
-- rounds started, finished and shared. It could not say how many people the
-- costume reached, whether they came back to it, or whether anyone knocked on
-- the cloche. This is the reach ledger, built like announcement_views: one row
-- per (occasion, device, ET day, room, moment), so the primary key does the
-- counting and a replayed beacon is a no-op.
--
-- Written by POST /api/occasions/seen ("seen", never "view": ad blockers match
-- that word in a URL). The client sends it only from a tracked round wearing
-- the costume the calendar put on, never from a `?occasion=` override, a
-- preview, a playtest or a showcase; and the Worker re-runs the fold on
-- `play_day` and refuses a sighting of a costume that day did not wear.
--
--   seen_day  the ET day the costume was on screen (reach is counted by this)
--   play_day  the round's own day that put it on: the puzzle date in the diner,
--             the night key at the bar. A Leftover from Oct 31 replayed in March
--             has seen_day in March and play_day Oct 31; the report counts that
--             as "came back to it after", attributed to the run by play_day.
--   room      diner | bar
--   moment    seen | knock (the ghost under the cloche). More moments are a
--             code change; no CHECK, like occasion_id.
--
-- Anonymous and device-scoped like every other analytics table, and wiped with
-- the rest by the Activity tab's "my own test data" delete. Additive only.

CREATE TABLE IF NOT EXISTS occasion_views (
  occasion_id TEXT NOT NULL,
  player_id   TEXT NOT NULL,
  seen_day    TEXT NOT NULL,
  play_day    TEXT NOT NULL,
  room        TEXT NOT NULL,
  moment      TEXT NOT NULL,
  surface     TEXT NOT NULL,
  seen_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (occasion_id, player_id, seen_day, room, moment)
);

CREATE INDEX IF NOT EXISTS idx_occasion_views_play ON occasion_views(occasion_id, play_day);
CREATE INDEX IF NOT EXISTS idx_occasion_views_player ON occasion_views(player_id);
