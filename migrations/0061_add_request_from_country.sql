-- Where a suggestion was sent from: the requester's country as Cloudflare's
-- edge resolved it (ISO 3166-1 alpha-2, or `T1` / `XX`), stamped by the Worker
-- on insert the way analytics_rounds.country is (migrations/0018). The client
-- has no say in it. Not the dish's own `country`, which is what the player typed.
--
-- NULL is a request sent before this column, or from local dev: unmeasured,
-- never an unknown place. Nothing is backfilled. Additive only.

ALTER TABLE dish_requests ADD COLUMN from_country TEXT;
