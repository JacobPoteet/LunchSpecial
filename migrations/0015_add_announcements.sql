-- Announcements: short notices the diner posts to players (new dishes, a
-- Discord launch, a holiday menu). Written in /admin, shown as a modal on
-- Today's Special after the how-to, once per player.
--
-- Two tables, deliberately separate:
--   announcements       — the content + when it runs + who it's for (authored)
--   announcement_views  — who actually saw it (anonymous reach, one row/device)
--
-- The reach table is NOT the dedup mechanism for the player — localStorage
-- decides what a device has already seen, so the modal can open with no network
-- round-trip. This table is the honest count for the admin panel: PRIMARY KEY
-- (announcement_id, player_id) makes a re-view (cleared storage, second browser)
-- idempotent, so "players reached" never double-counts one device.
--
-- Additive only — safe to run against prod on the next release.

CREATE TABLE IF NOT EXISTS announcements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  header      TEXT NOT NULL,                        -- modal title
  body        TEXT NOT NULL,                        -- limited markdown (bold/italic/link)
  -- Who it's eligible for: everyone, or only players who have finished a game
  -- before ('returning'). New players see 'all' notices after the how-to.
  audience    TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'returning')),
  -- Active window as ET calendar days (YYYY-MM-DD), BOTH ENDS INCLUSIVE — the
  -- same midnight-ET day the Special itself rolls over on (shared/time.ts).
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  -- Manual kill switch: unset to retire a notice before its window ends without
  -- deleting it (and its reach numbers).
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The player-facing query is "which notices are live on this ET day".
CREATE INDEX IF NOT EXISTS idx_announcements_window ON announcements(start_date, end_date);

CREATE TABLE IF NOT EXISTS announcement_views (
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  -- Anonymous per-device id (the same localStorage UUID the analytics beacons
  -- send). Not an account, not a person.
  player_id       TEXT NOT NULL,
  surface         TEXT NOT NULL DEFAULT 'web',      -- 'web' | 'discord'
  seen_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (announcement_id, player_id)
);

-- Drives the reach-over-time series in the admin panel.
CREATE INDEX IF NOT EXISTS idx_announcement_views_seen ON announcement_views(announcement_id, seen_at);
