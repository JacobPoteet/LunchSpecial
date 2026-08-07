-- Record which country each analytics round was started from (GitHub #92).
-- Cloudflare's edge already resolves it for every request that reaches the
-- Worker, so the beacon handler reads request.cf.country (falling back to the
-- CF-IPCountry header) and stores it on insert — the client sends nothing, and
-- there is nothing for it to spoof.
--
-- ISO 3166-1 alpha-2, plus the two non-country values Cloudflare can return:
-- 'T1' (Tor exit node) and 'XX' (couldn't be determined). Still anonymous — a
-- country is not an identifier, and no IP is stored anywhere.
--
-- The point of the metric is the gap it exposes: a scraper that fetches HTML
-- never runs the JS that fires this beacon, so a country that shows up in
-- Cloudflare's request analytics but never here is traffic that never played.
--
-- Additive only — safe to run against prod on the next release. Existing rows
-- keep NULL (unmeasured, not "unknown country") and are reported separately
-- rather than folded into a slice of the distribution.

ALTER TABLE analytics_rounds ADD COLUMN country TEXT;

CREATE INDEX IF NOT EXISTS idx_analytics_rounds_country ON analytics_rounds(country);
