-- Anonymous engagement analytics. One row per round, keyed by a client-generated
-- round_id: created on game start, updated on completion and share. No guess content.
-- Additive only — safe to run against prod on the next release.

CREATE TABLE IF NOT EXISTS analytics_rounds (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id      TEXT NOT NULL UNIQUE,   -- client-generated per puzzle/device; dedupes starts + links updates
  puzzle_number INTEGER NOT NULL,
  play_date     TEXT NOT NULL,          -- YYYY-MM-DD, the puzzle's date (player-local)
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  guesses       INTEGER,                -- 1..6, filled on completion
  solved        INTEGER,                -- 0/1, filled on completion
  completed     INTEGER NOT NULL DEFAULT 0,
  shared        INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_analytics_rounds_play_date ON analytics_rounds(play_date);
