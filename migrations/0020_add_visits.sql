-- The top of the funnel, which until now did not exist.
--
-- A round counts as "started" on the player's **first submitted guess** (GitHub
-- #27) — deliberately, because opening a page is not playing a game. The cost of
-- that choice is that everyone who loads the game and never guesses is invisible:
-- the dashboard's widest number was "games started", and nothing above it. So
-- "did my change make more visitors actually play" — the most natural engagement
-- hypothesis there is — could not be asked at all, and a change that doubled
-- interest while halving conversion looked identical to no change.
--
-- One row per device per ET day. Not per page load: the question is how many
-- people showed up, and a device that opens the game four times in a morning is
-- one visitor, the same rule the repeat-visit curve uses for what a "visit" is.
-- The composite primary key makes the insert idempotent, so the beacon can fire
-- as often as it likes and a cleared sessionStorage costs nothing.
--
-- Anonymous exactly like analytics_rounds: a random localStorage id, a surface,
-- an edge-resolved country, and no IP. Nothing here identifies a person, and the
-- client sends neither the day nor the country — both are stamped server-side, so
-- there is nothing to spoof.
--
-- Additive only — safe to run against prod on the next release. Note that days
-- before this ships have NO rows, which is *unmeasured*, not "nobody visited":
-- the dashboard reports those as null rather than as a 100% bounce rate.

CREATE TABLE IF NOT EXISTS analytics_visits (
  -- ET calendar day of the visit, stamped by the Worker (same midnight-ET
  -- rollover as the Special), never sent by the client.
  visit_day     TEXT NOT NULL,
  -- Anonymous per-device id — the same localStorage UUID the round beacons carry.
  player_id     TEXT NOT NULL,
  surface       TEXT NOT NULL DEFAULT 'web',
  -- ISO 3166-1 alpha-2 from Cloudflare's edge, plus its two non-countries
  -- ('T1' Tor, 'XX' unresolved). Null in local dev.
  country       TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (visit_day, player_id)
);

-- The day slice and the daily series both read this by day.
CREATE INDEX IF NOT EXISTS idx_analytics_visits_day ON analytics_visits(visit_day);
