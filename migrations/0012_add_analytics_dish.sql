-- Record which dish each analytics round actually played. The admin activity
-- feed used to resolve the dish by joining `schedule` on the play date, which
-- only works for daily/leftover rounds (they play the scheduled dish). A
-- `random` (Chef's Choice) round's dish is picked deterministically from its
-- seed and never appears in the schedule, so the feed could only show it as
-- blank. Store the resolved dish_id on the row instead (set on insert).
-- Additive only — safe to run against prod on the next release. Pre-existing
-- rows keep NULL and fall back to the old schedule join in the feed query.

ALTER TABLE analytics_rounds ADD COLUMN dish_id INTEGER;
