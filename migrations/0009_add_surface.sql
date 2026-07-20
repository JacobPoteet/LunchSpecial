-- Tag each analytics round with the surface it was played on: the open web
-- ('web') or the Discord Activity ('discord'). Lets the admin dashboard split
-- engagement by where players came from (web / Discord / all).
-- The value is derived client-side from the same `frame_id` signal that boots
-- the Discord Activity (see src/discord/bootstrap.ts) — no accounts, no personal
-- data, same anonymous model as round_id / player_id.
-- Existing rows predate this column and default to 'web' (all traffic was the
-- public site before the Discord embed shipped its own analytics surface).
-- Additive only — safe to run against prod on the next release.

ALTER TABLE analytics_rounds ADD COLUMN surface TEXT NOT NULL DEFAULT 'web';

CREATE INDEX IF NOT EXISTS idx_analytics_rounds_surface ON analytics_rounds(surface);
