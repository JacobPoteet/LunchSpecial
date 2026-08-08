-- The change log the dashboard measures against.
--
-- Every chart on this dashboard answers "what is happening" and none of them
-- answered "did the thing I shipped do anything". Without a record of when a
-- change went live there is nothing to compare a before to an after of, so the
-- workflow the game is actually run on — form a hypothesis, ship it, read the
-- numbers — had no support at all.
--
-- One row per deliberate change: what it was, what you expected, the ET day it
-- went live, and which metric it was supposed to move. Naming the metric *up
-- front* is the point rather than a convenience: picking it after the fact means
-- picking whichever one happened to wiggle, which is how a dashboard talks its
-- owner into shipping noise.
--
-- No player data, no foreign keys — this is admin-authored notes about the game,
-- and like the schedule it lives only in prod D1 with no repo representation.
-- Additive only; safe to run against prod on the next release.

CREATE TABLE IF NOT EXISTS experiments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Short name, drawn on the marker over every time-series chart.
  label       TEXT NOT NULL,
  -- What you expected to happen and why. Free text, may be empty.
  hypothesis  TEXT NOT NULL DEFAULT '',
  -- Which per-day metric this was meant to move. Validated in the Worker against
  -- EXPERIMENT_METRICS (shared/types.ts) rather than by a CHECK, so adding a
  -- metric doesn't need a migration to rewrite the table.
  metric      TEXT NOT NULL,
  -- The ET day the change went live (YYYY-MM-DD). The comparison splits the
  -- daily series here: days strictly before are the "before", this day and after
  -- are the "after" (a change shipped during a day affects the rest of it).
  shipped_on  TEXT NOT NULL CHECK (shipped_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The tab and every chart marker read these in ship order.
CREATE INDEX IF NOT EXISTS idx_experiments_shipped ON experiments(shipped_on);
