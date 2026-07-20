-- Track a stable, anonymous per-device player id on each analytics round so the
-- dashboard can split players into "new" (first time ever) vs "returning" (played
-- on an earlier day). The id is a random UUID generated client-side and kept in
-- localStorage — no accounts, no personal data, same anonymous model as round_id.
-- Existing rows have no player_id (NULL); they simply don't count toward the
-- new/returning split, which is meaningful only from this release forward.
-- Additive only — safe to run against prod on the next release.

ALTER TABLE analytics_rounds ADD COLUMN player_id TEXT;

CREATE INDEX IF NOT EXISTS idx_analytics_rounds_player_id ON analytics_rounds(player_id);
