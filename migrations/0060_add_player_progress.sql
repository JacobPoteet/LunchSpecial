-- A Discord player's saved progress (#251). The Discord mobile app drops the
-- Activity's localStorage whenever the app is quit, so a player who authorizes
-- gets their streaks, archive and first-visit flags kept here instead, under
-- an opaque id the Worker derives from their Discord id with a secret
-- (worker/playerid.ts). `progress` is the JSON of shared/progress.ts's keys.
--
-- No name, avatar or Discord id is stored. Additive only.

CREATE TABLE IF NOT EXISTS player_progress (
  player_id  TEXT PRIMARY KEY,
  progress   TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
