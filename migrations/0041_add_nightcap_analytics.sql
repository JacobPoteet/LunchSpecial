-- After Dark rounds on the existing beacon table.
--
-- A fourth `kind` ('nightcap') rather than a second table. Every kind-split
-- query, filter and colour already exists, and the day-slice SQL narrows to
-- kind = 'daily', so it excludes nightcaps for free. The one thing that does NOT
-- come free is pooling: a Nightcap gives four guesses, so any aggregate touching
-- `guesses`, `solved` or a win rate has to split on kind or it will report a
-- "won in 4" that means two different things. See the distribution queries in
-- routes/admin.ts.
--
-- Note that `play_date` on a nightcap row holds the LOCAL night key, not an ET
-- day. The two kinds cannot be pooled on that column either.

-- Which drink the round played. The sibling of dish_id (migrations/0012) and
-- separate from it, because the two point into different catalogues and a
-- single column would need a discriminator to be read safely.
ALTER TABLE analytics_rounds ADD COLUMN drink_id INTEGER;

-- The device's UTC offset in minutes, east-positive, on Nightcap rounds only.
--
-- Every other beacon field is either stamped server-side or a fact about the
-- game. This one is a fact about the player's clock, and it exists because the
-- bar's window is defined on local time: without it, "when do people drink" can
-- only be answered in ET, where every player's 9pm lands in a different bucket
-- and the profile is noise rather than a reading.
--
-- Coarser than the country already stamped on every row (a country implies an
-- offset; an offset implies a band of dozens of countries), so it gives away
-- nothing that was not already there. NULL on every non-nightcap row and on any
-- round from a client that predates it -- unmeasured, never midnight.
ALTER TABLE analytics_rounds ADD COLUMN tz_offset INTEGER;

CREATE INDEX IF NOT EXISTS idx_analytics_rounds_kind ON analytics_rounds(kind);
