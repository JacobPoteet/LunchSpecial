-- Tag each analytics round with the kind of game it was: the daily Special
-- ('daily'), a "leftover" (archive replay of a past puzzle, 'leftover'), or a
-- "chef's special" (random recipe, 'random'). Before this, only the daily fired
-- beacons, so every existing row is a daily — the DEFAULT backfills them.
-- Additive only — safe to run against prod on the next release.

ALTER TABLE analytics_rounds ADD COLUMN kind TEXT NOT NULL DEFAULT 'daily';

CREATE INDEX IF NOT EXISTS idx_analytics_rounds_kind ON analytics_rounds(kind);
