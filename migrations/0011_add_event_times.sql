-- Per-event timestamps so the admin dashboard can render a "recent activity"
-- log (GitHub #47) instead of only aggregates. analytics_rounds is one row per
-- round, and `updated_at` was overwritten by whichever beacon landed last, so a
-- round that was completed and then shared lost its completion time.
--
-- These two columns pin the *first* time each of those things happened. The
-- event feed falls back to `updated_at` (then `started_at`) for rows written
-- before this shipped, so history still shows up — just less precisely.
-- Additive only — safe to run against prod on the next release.

ALTER TABLE analytics_rounds ADD COLUMN completed_at TEXT;
ALTER TABLE analytics_rounds ADD COLUMN shared_at TEXT;

-- The feed orders by time descending across all three event kinds.
CREATE INDEX IF NOT EXISTS idx_analytics_rounds_started_at ON analytics_rounds(started_at);
