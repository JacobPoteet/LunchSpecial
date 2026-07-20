-- Player-submitted dish requests. After finishing a round players can suggest a
-- dish for the menu; the suggestions land here for the admin to review, remove,
-- or turn into a real dish. Anonymous, same model as analytics — an optional
-- per-device player_id and the play surface, no accounts, no personal data.
-- Not part of the game catalog (that's `dishes`); purely an inbox.
-- Additive only — safe to run against prod on the next release.

CREATE TABLE IF NOT EXISTS dish_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,                       -- the requested dish
  country     TEXT,                                -- optional, free text
  note        TEXT,                                -- optional player note
  surface     TEXT NOT NULL DEFAULT 'web',         -- 'web' | 'discord'
  player_id   TEXT,                                -- optional anonymous device id
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dish_requests_created ON dish_requests(created_at);
