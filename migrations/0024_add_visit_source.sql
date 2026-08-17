-- Where an arrival came from: the `utm_source` on the landing URL.
--
-- Until now nothing recorded how anyone found the game, so the dashboard could
-- see that a Tuesday was busy and never why. That is tolerable while every
-- player arrives through a channel you chose by hand, and useless the moment
-- money is spent on one: "did the ad bring people" and, the question that
-- actually decides whether to spend again, "did the people it brought come
-- back" are both unanswerable without this column.
--
-- On the **visits** table rather than the rounds table, deliberately. A visit is
-- one row per device per ET day and sits at the top of the funnel, which is
-- exactly where an arrival is attributable; a round is a game, and a player who
-- arrives once and plays four times did not arrive four times.
--
-- Three things about the values:
--
-- 1. NULL means **recorded before this shipped**, and nothing else. An arrival
--    that carried no utm tag stores the literal 'direct'. Letting untagged
--    arrivals share NULL with unmeasured ones would make the game's whole
--    history look like a long run of organic traffic — the same lie as
--    reporting an unmeasured visit count as zero.
-- 2. This is the **only** field on any beacon that starts life in a URL the
--    player controls, so the Worker re-normalises it on the way in
--    (shared/attribution.ts): lowercased, `[a-z0-9_.-]`, 32 chars, anything else
--    dropped to 'direct'. Nothing is stored that a hand-mangled link could name.
-- 3. Attribution is **first touch of the day**. The insert is
--    ON CONFLICT DO NOTHING, so a device that opened the game directly this
--    morning and clicked an ad at lunch keeps 'direct' — the ad did not bring
--    them today. A player's *acquisition* source is the source on their earliest
--    visit row, which is a join on player_id, not a column.
--
-- Additive and nullable — safe against prod on the next release.

ALTER TABLE analytics_visits ADD COLUMN source TEXT;

-- The source read groups every visit by (source, player) to find each device's
-- first touch, so it scans the whole table; this keeps that from being a scan
-- per source once there are a few campaigns' worth of rows.
CREATE INDEX IF NOT EXISTS idx_analytics_visits_source ON analytics_visits(source);
