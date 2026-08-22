-- Who reaches for the mute button (the audio pass).
--
-- One row per device, upserted — this is a *state* with a counter, not an event
-- log, because the only two things worth knowing are "where did this device end
-- up" and "how often did they change their mind". A row per press would be a
-- table that grows forever to answer a question nobody is going to ask twice.
--
-- Deliberately not part of analytics_rounds: a mute toggle isn't a round, it
-- can happen before any round exists, and joining it to one would invent a
-- relationship. Nothing on the dashboard quotes a rate off this table — see the
-- note on beaconSound in src/api.ts for why that would be dishonest.
CREATE TABLE IF NOT EXISTS sound_prefs (
  player_id  TEXT PRIMARY KEY,
  muted      INTEGER NOT NULL,
  toggles    INTEGER NOT NULL,
  surface    TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
